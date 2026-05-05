"""Layout calibrator: sends a handful of sample pages to Gemini and gets
back a per-document layout profile (header/footer text, font size ranges,
page number position, watermark text, etc.) that the heuristic pipeline
uses to filter noise.

Sample size: 6-8 pages picked spread across the document. Below 4 we
get false positives on font sizes, above 10 the cost goes up without
much accuracy gain.

Notes:
  - thinkingBudget=0 in the request. The thinking tokens were eating
    most of our output budget and we already get good JSON without it.
  - maxOutputTokens is 8192. The full LayoutProfile is small but Gemini
    sometimes pads with explanation that we then have to strip.
  - JSON parsing tries three strategies (raw, fenced, brace-scan) since
    the model's compliance with "JSON only" is variable.
"""

from __future__ import annotations

import base64
import json
import re
from dataclasses import dataclass, field
from typing import Optional

import fitz  # pymupdf
import structlog

logger = structlog.get_logger()


# Sane defaults that work on most non-fiction books. The calibrator
# overwrites these per-document; they're the fallback when Gemini fails.
DEFAULT_PROFILE = {
    "header_texts": [],
    "footer_texts": [],
    "page_number_format": "numeric",
    "page_number_position": "bottom-center",
    "body_font_size_min": 9,
    "body_font_size_max": 13,
    "title_font_size_min": 18,
    "heading_font_size_min": 14,
    "heading_is_bold": True,
    "has_columns": 1,
    "header_zone_pct": 0.08,
    "footer_zone_pct": 0.08,
    "content_start_after": "",
    "watermark_text": "",
    "metadata_end_keywords": [],
}


@dataclass
class LayoutProfile:
    """Per-document layout summary returned by the calibrator."""
    header_texts: list[str] = field(default_factory=list)
    footer_texts: list[str] = field(default_factory=list)
    page_number_format: str = "numeric"
    page_number_position: str = "bottom-center"
    body_font_size_min: float = 9.0
    body_font_size_max: float = 13.0
    title_font_size_min: float = 18.0
    heading_font_size_min: float = 14.0
    heading_is_bold: bool = True
    has_columns: int = 1
    header_zone_pct: float = 0.08
    footer_zone_pct: float = 0.08
    content_start_after: str = ""
    watermark_text: str = ""
    metadata_end_keywords: list[str] = field(default_factory=list)

    # Set to True only when Gemini returned a parsed response. If False
    # the rest of the fields come from DEFAULT_PROFILE and shouldn't be
    # trusted as much.
    gemini_calibrated: bool = False

    @classmethod
    def from_dict(cls, d: dict) -> "LayoutProfile":
        """Build a profile from Gemini's JSON, with defaults for missing fields."""
        defaults = DEFAULT_PROFILE.copy()
        for k, v in d.items():
            if v is not None and k in defaults:
                defaults[k] = v

        def _cast(key, val):
            if key in ('body_font_size_min', 'body_font_size_max',
                       'title_font_size_min', 'heading_font_size_min',
                       'header_zone_pct', 'footer_zone_pct'):
                try:
                    return float(val)
                except (ValueError, TypeError):
                    return float(DEFAULT_PROFILE[key])
            if key == 'has_columns':
                try:
                    return int(val)
                except (ValueError, TypeError):
                    return 1
            if key == 'heading_is_bold':
                if isinstance(val, str):
                    return val.lower() in ('true', '1', 'yes')
                return bool(val)
            if key in ('header_texts', 'footer_texts', 'metadata_end_keywords'):
                if isinstance(val, list):
                    return [str(x) for x in val if x]
                if isinstance(val, str):
                    return [val] if val else []
                return []
            if key == 'gemini_calibrated':
                return bool(val)
            return str(val) if val is not None else ""

        result = {}
        for k in cls.__dataclass_fields__:
            if k == 'gemini_calibrated':
                result[k] = True  # If we're calling from_dict, Gemini returned data
            else:
                result[k] = _cast(k, defaults.get(k, ""))

        return cls(**result)


GEMINI_PROMPT = """You are a PDF document layout analyzer. I'm sending you several sample pages from a PDF document. Carefully examine EVERY page and identify the layout patterns.

YOUR TASK: Return a JSON object describing the layout. Be VERY SPECIFIC - use the EXACT text you see for headers/footers.

REQUIRED JSON FORMAT (return ONLY this JSON, no other text, no markdown, no backticks):
{
  "header_texts": ["exact header text that repeats on multiple pages - look at the TOP of each page"],
  "footer_texts": ["exact footer text that repeats on multiple pages - look at the BOTTOM of each page"],
  "page_number_format": "numeric or roman or dashed or page-x or x-of-y or none",
  "page_number_position": "top-left or top-center or top-right or bottom-left or bottom-center or bottom-right",
  "body_font_size_min": 10,
  "body_font_size_max": 12,
  "title_font_size_min": 20,
  "heading_font_size_min": 14,
  "heading_is_bold": true,
  "has_columns": 1,
  "header_zone_pct": 0.08,
  "footer_zone_pct": 0.08,
  "content_start_after": "the title or section name after which the MAIN content of the book/document begins, such as 'Introduction' or 'Chapter 1' - this helps skip past copyright pages, table of contents, etc.",
  "watermark_text": "",
  "metadata_end_keywords": ["copyright", "isbn", "published by", "table of contents"]
}

CRITICAL INSTRUCTIONS:
1. For header_texts: Look at the VERY TOP of pages 3, 4, 5+ - text that appears in the same position on multiple pages IS a header. Include the EXACT text. If no repeating header, return [].
2. For footer_texts: Same but at the VERY BOTTOM. Include exact text.
3. For body font size: Estimate the size of the MAIN body text (the majority of text on content pages) in POINTS.
4. For title font size: What's the MINIMUM font size that indicates a chapter title? Look at chapter headings - they're typically 1.5-2x the body text size.
5. For heading font size: What's the MINIMUM for section headings? Typically 1.2-1.5x body text.
6. For content_start_after: What text or section marks the START of the actual content? For books, this is usually "Introduction" or "Chapter 1" or "Prologue". Everything before this (copyright, ISBN, dedication, table of contents) is front matter.
7. For metadata_end_keywords: What keywords appear in the front matter pages? Examples: "copyright", "isbn", "all rights reserved", "published by", "table of contents"

RETURN ONLY THE JSON. No explanations. No markdown code blocks. Just the raw JSON object."""


def _pick_sample_pages(total_pages: int) -> list[int]:
    """Pick 4 representative pages - enough for layout detection, small payload."""
    if total_pages <= 4:
        return list(range(total_pages))

    pages = [
        0,                              # Cover/title page
        min(3, total_pages - 1),         # Early content (TOC or intro)
        total_pages // 2,                # Middle of document
        total_pages - 1,                 # Last page
    ]
    return sorted(set(p for p in pages if p < total_pages))


def _render_page_to_base64(doc: fitz.Document, page_num: int, dpi: int = 72) -> str:
    """Render a PDF page to a base64-encoded PNG at low DPI for small payload."""
    page = doc[page_num]
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat)
    png_bytes = pix.tobytes("png")
    return base64.b64encode(png_bytes).decode("utf-8")


async def calibrate_with_gemini(
    pdf_path: str,
    api_key: str,
    model: str = "gemini-2.5-flash",
) -> LayoutProfile:
    """
    Send sample pages to Gemini and get a layout profile.
    Falls back to default profile if Gemini is unavailable.
    """
    import httpx

    if not api_key:
        logger.warning("gemini_no_key", msg="No Gemini API key, using default heuristics")
        return LayoutProfile()

    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    sample_indices = _pick_sample_pages(total_pages)

    logger.info("gemini_calibrate_start",
                pages=sample_indices, total=total_pages,
                model=model, num_samples=len(sample_indices))

    # Build multimodal request with page images
    parts = [{"text": GEMINI_PROMPT}]

    for page_num in sample_indices:
        b64 = _render_page_to_base64(doc, page_num)
        parts.append({
            "inline_data": {
                "mime_type": "image/png",
                "data": b64,
            }
        })
        parts.append({"text": f"[Page {page_num + 1} of {total_pages}]"})

    doc.close()

    # Call Gemini API
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 8192,
        },
    }

    try:
        logger.info("gemini_api_call", url=url, payload_parts=len(parts))

        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": api_key,
                },
            )

        logger.info("gemini_api_response", status=resp.status_code)

        if resp.status_code != 200:
            logger.error("gemini_api_error",
                         status=resp.status_code,
                         body=resp.text[:1000])
            return LayoutProfile()

        data = resp.json()

        # Log token usage
        usage = data.get("usageMetadata", {})
        prompt_tokens = usage.get("promptTokenCount", 0)
        response_tokens = usage.get("candidatesTokenCount", 0)
        total_tokens = usage.get("totalTokenCount", 0)
        thinking_tokens = usage.get("thoughtsTokenCount", 0)
        logger.info("gemini_token_usage",
                     prompt_tokens=prompt_tokens,
                     response_tokens=response_tokens,
                     thinking_tokens=thinking_tokens,
                     total_tokens=total_tokens,
                     est_cost_usd=round(prompt_tokens * 0.00000015 + response_tokens * 0.0000006, 6))

        # Extract text response from candidates
        candidates = data.get("candidates", [])
        if not candidates:
            logger.error("gemini_no_candidates", raw_keys=list(data.keys()),
                         raw_preview=str(data)[:500])
            return LayoutProfile()

        # Check for blocked content
        finish_reason = candidates[0].get("finishReason", "")
        if finish_reason == "SAFETY":
            logger.error("gemini_blocked", reason="safety filter")
            return LayoutProfile()

        response_text = ""
        for part in candidates[0].get("content", {}).get("parts", []):
            if "text" in part:
                response_text += part["text"]

        if not response_text.strip():
            logger.error("gemini_empty_response",
                         candidate_keys=list(candidates[0].keys()),
                         finish_reason=finish_reason)
            return LayoutProfile()

        logger.info("gemini_raw_response",
                     length=len(response_text),
                     preview=response_text[:300])

        # Parse JSON from response
        profile_dict = _parse_json_response(response_text)

        if profile_dict:
            profile = LayoutProfile.from_dict(profile_dict)
            logger.info("gemini_calibrate_success",
                         header_texts=profile.header_texts,
                         footer_texts=profile.footer_texts,
                         title_min=profile.title_font_size_min,
                         heading_min=profile.heading_font_size_min,
                         body_range=f"{profile.body_font_size_min}-{profile.body_font_size_max}",
                         content_start=profile.content_start_after,
                         watermark=profile.watermark_text)
            return profile
        else:
            logger.error("gemini_parse_failed",
                         response_preview=response_text[:500])
            return LayoutProfile()

    except httpx.TimeoutException:
        logger.error("gemini_timeout", msg="Gemini API timed out after 90s")
        return LayoutProfile()
    except Exception as e:
        logger.error("gemini_calibrate_error", error=str(e), error_type=type(e).__name__)
        return LayoutProfile()


def _parse_json_response(text: str) -> Optional[dict]:
    """Extract JSON from Gemini response using multiple strategies."""
    text = text.strip()

    # Strategy 1: Direct JSON parse
    try:
        result = json.loads(text)
        if isinstance(result, dict):
            return result
    except json.JSONDecodeError:
        pass

    # Strategy 2: Remove markdown fencing
    cleaned = re.sub(r'^```(?:json)?\s*\n?', '', text)
    cleaned = re.sub(r'\n?```\s*$', '', cleaned).strip()
    try:
        result = json.loads(cleaned)
        if isinstance(result, dict):
            return result
    except json.JSONDecodeError:
        pass

    # Strategy 3: Find the outermost { ... } block
    brace_count = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == '{':
            if start == -1:
                start = i
            brace_count += 1
        elif ch == '}':
            brace_count -= 1
            if brace_count == 0 and start >= 0:
                try:
                    result = json.loads(text[start:i + 1])
                    if isinstance(result, dict):
                        return result
                except json.JSONDecodeError:
                    pass
                start = -1

    # Strategy 4: Try to fix common issues (trailing commas, single quotes)
    if start >= 0:
        json_str = text[start:]
        # Find matching closing brace
        depth = 0
        for i, ch in enumerate(json_str):
            if ch == '{': depth += 1
            elif ch == '}': depth -= 1
            if depth == 0:
                json_str = json_str[:i + 1]
                break

        # Fix trailing commas before } or ]
        json_str = re.sub(r',\s*([}\]])', r'\1', json_str)
        # Fix single quotes to double quotes
        json_str = json_str.replace("'", '"')

        try:
            result = json.loads(json_str)
            if isinstance(result, dict):
                return result
        except json.JSONDecodeError:
            pass

    logger.error("json_parse_all_strategies_failed",
                 text_length=len(text),
                 text_start=text[:200])
    return None
