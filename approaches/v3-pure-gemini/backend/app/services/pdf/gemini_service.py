"""
Gemini-based PDF extraction.

Two stages:
  1. Render 4 sample pages and ask Gemini for the layout (header text,
     footer text, where page numbers sit, watermark, where content starts).
  2. Send the full PDF to Gemini with that layout as context, get back
     body text with [TITLE] / [HEADING] markers.

Step 2 only works because of step 1. Without the layout context Gemini
can't reliably tell book content from running headers, and extraction
quality drops a lot (we tried it both ways).

Cost is roughly $0.04 for a 100-page book and $0.09 for a 256-page book
on Gemini 2.5 Flash. Most of that is the input PDF tokens.

Needs pdf2image + poppler-utils only for the 4 sample renders.
"""

from __future__ import annotations

import asyncio
import base64
import json
import re
from pathlib import Path
from typing import Optional

import structlog

logger = structlog.get_logger()

# Compact prompts. Output tokens cost more than input, so we keep the
# response format as small as possible.
CALIBRATION_PROMPT = """Look at these 4 sample pages. Return ONLY JSON:
{"header":"exact repeating header text or empty","footer":"exact repeating footer text or empty","page_num_pos":"bottom-center or none","watermark":"text or empty","content_start":"section name where main content begins like Introduction or Chapter 1"}
No markdown. No backticks. Just JSON."""

EXTRACTION_PROMPT = """Read this PDF and return the body text.
{layout_context}
RULES: Remove headers/footers/page numbers/watermarks. Skip copyright, dedication, table of contents pages.
Mark chapters: [TITLE]Name[/TITLE]
Mark sections: [HEADING]Name[/HEADING]
Keep body text exactly as written. Keep lists. Paragraphs separated by blank lines.
Start from the main content. No commentary."""

EXTRACTION_PROMPT_RANGE = """Read pages {start}-{end} of this PDF and return the body text.
{layout_context}
RULES: Remove headers/footers/page numbers/watermarks.
Mark chapters: [TITLE]Name[/TITLE]
Mark sections: [HEADING]Name[/HEADING]
Keep body text exactly as written. Keep lists. Paragraphs separated by blank lines. No commentary."""


async def extract_pdf_with_gemini(
    pdf_path: str,
    api_key: str,
) -> tuple[str, list[dict], int, int]:
    """Run the full pipeline. Returns (clean_text, chapters, content_start, total_pages)."""

    pdf_bytes = Path(pdf_path).read_bytes()
    pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")
    file_size_mb = len(pdf_bytes) / (1024 * 1024)

    # Gemini's hard limit is 20MB on the inline_data path
    if file_size_mb > 20:
        logger.error("pdf_too_large", size_mb=round(file_size_mb, 1))
        return "", [], 0, 0

    logger.info("pipeline_start", size_mb=round(file_size_mb, 1))

    layout = await _calibrate(pdf_path, api_key)
    layout_context = _format_layout(layout)

    # Page count from poppler. Fallback heuristic if pdfinfo blows up,
    # which happens on a few weird PDFs we've hit.
    try:
        from pdf2image.pdf2image import pdfinfo_from_path
        info = pdfinfo_from_path(pdf_path)
        actual_pages = info.get("Pages", 1)
    except Exception:
        actual_pages = max(1, int(len(pdf_bytes) / 8000))

    # Small breather so we don't trip the free-tier rate limit
    await asyncio.sleep(2)

    # 150 pages is roughly where one extraction request stops fitting in
    # the 65k output token budget. Above that we split in half.
    if actual_pages <= 150:
        clean_text, total_tokens = await _extract_single(pdf_b64, layout_context, api_key)
    else:
        clean_text, total_tokens = await _extract_split(pdf_b64, layout_context, api_key, actual_pages)

    if not clean_text.strip():
        return "", [], 0, 0

    chapters = _extract_chapters(clean_text)
    display_text = _strip_markers(clean_text)

    # Re-anchor each chapter's char offset against the marker-stripped text
    for ch in chapters:
        pos = display_text.find(ch["title"])
        if pos < 0:
            pos = display_text.lower().find(ch["title"].lower())
        ch["char_offset"] = pos if pos >= 0 else 0

    content_start = _find_content_start(display_text, chapters, layout)
    total_pages = actual_pages

    logger.info("pipeline_done",
                chars=len(display_text), chapters=len(chapters),
                pages=total_pages, total_tokens=total_tokens)

    return display_text, chapters, content_start, total_pages


async def _calibrate(pdf_path: str, api_key: str) -> dict:
    """Render 4 pages and ask Gemini what the layout looks like."""
    from pdf2image import convert_from_path
    from pdf2image.pdf2image import pdfinfo_from_path
    import io

    try:
        # Get page count without rendering (fast)
        info = pdfinfo_from_path(pdf_path)
        total = info.get("Pages", 1)
    except Exception as e:
        logger.error("pdfinfo_error", error=str(e))
        return {}

    # Pick 4 representative pages
    if total <= 4:
        page_nums = list(range(1, total + 1))
    else:
        page_nums = [1, min(4, total), total // 2, total]

    # Render at 72 DPI
    parts = [{"text": CALIBRATION_PROMPT}]
    for pn in page_nums:
        try:
            imgs = convert_from_path(pdf_path, first_page=pn, last_page=pn, dpi=72)
            if imgs:
                buf = io.BytesIO()
                imgs[0].save(buf, format="PNG", optimize=True)
                b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                parts.append({"inline_data": {"mime_type": "image/png", "data": b64}})
                parts.append({"text": f"[Page {pn} of {total}]"})
        except Exception:
            continue

    logger.info("calibration_start", pages=page_nums, total=total)

    text, tokens = await _call_gemini(
        parts=parts,
        api_key=api_key,
        label="calibration",
        max_output=1024,
    )

    result = _parse_json(text)
    if result:
        logger.info("calibration_done", layout=result, tokens=tokens)
    else:
        logger.warning("calibration_parse_failed", response=text[:200])

    return result or {}


# Step 2: Extraction
async def _extract_single(pdf_b64: str, layout_context: str, api_key: str) -> tuple[str, int]:
    """One-shot extraction. Used when the PDF fits comfortably in a single request."""
    return await _call_gemini(
        parts=[
            {"inline_data": {"mime_type": "application/pdf", "data": pdf_b64}},
            {"text": EXTRACTION_PROMPT.format(layout_context=layout_context)},
        ],
        api_key=api_key,
        label="extract_full",
        max_output=65536,
    )


async def _extract_split(pdf_b64: str, layout_context: str, api_key: str, est_pages: int) -> tuple[str, int]:
    """Split-extraction for big books: two requests, first half then second half."""
    mid = est_pages // 2

    text1, t1 = await _call_gemini(
        parts=[
            {"inline_data": {"mime_type": "application/pdf", "data": pdf_b64}},
            {"text": EXTRACTION_PROMPT_RANGE.format(
                start=1, end=mid, layout_context=layout_context)},
        ],
        api_key=api_key,
        label=f"extract_p1-{mid}",
        max_output=65536,
    )

    # Pause between halves so we don't burn the rate limit. 5s has been enough.
    await asyncio.sleep(5)

    text2, t2 = await _call_gemini(
        parts=[
            {"inline_data": {"mime_type": "application/pdf", "data": pdf_b64}},
            {"text": EXTRACTION_PROMPT_RANGE.format(
                start=mid + 1, end=est_pages, layout_context=layout_context)},
        ],
        api_key=api_key,
        label=f"extract_p{mid+1}-{est_pages}",
        max_output=65536,
    )

    return (text1.strip() + "\n\n" + text2.strip()), t1 + t2


async def _call_gemini(parts: list, api_key: str, label: str, max_output: int = 8192) -> tuple[str, int]:
    """POST to Gemini with backoff on 429. Returns (text, total_tokens)."""
    import httpx

    for attempt in range(5):
        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                resp = await client.post(
                    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
                    json={
                        "contents": [{"parts": parts}],
                        "generationConfig": {
                            "temperature": 0.1,
                            "maxOutputTokens": max_output,
                        },
                    },
                    headers={
                        "Content-Type": "application/json",
                        "x-goog-api-key": api_key,
                    },
                )

            if resp.status_code == 429:
                wait = (attempt + 1) * 15
                logger.warning("rate_limited", label=label, attempt=attempt + 1, wait=wait)
                await asyncio.sleep(wait)
                continue

            if resp.status_code != 200:
                logger.error("gemini_error", label=label, status=resp.status_code,
                             body=resp.text[:300])
                return "", 0

            data = resp.json()
            usage = data.get("usageMetadata", {})
            inp = usage.get("promptTokenCount", 0)
            out = usage.get("candidatesTokenCount", 0)
            total = usage.get("totalTokenCount", 0)

            logger.info("gemini_done", label=label,
                         input_tokens=inp, output_tokens=out,
                         cost=round(inp * 0.00000015 + out * 0.0000006, 4))

            candidates = data.get("candidates", [])
            if not candidates:
                return "", total

            text = ""
            for part in candidates[0].get("content", {}).get("parts", []):
                if "text" in part:
                    text += part["text"]

            return text.strip(), total

        except Exception as e:
            logger.error("gemini_exception", label=label, error=str(e), attempt=attempt + 1)
            if attempt < 4:
                await asyncio.sleep(10)
                continue
            return "", 0

    return "", 0


def _format_layout(layout: dict) -> str:
    """Turn the calibration JSON into a few lines of prompt context."""
    if not layout:
        return ""
    parts = []
    if layout.get("header"):
        parts.append(f'REMOVE header: "{layout["header"]}"')
    if layout.get("footer"):
        parts.append(f'REMOVE footer: "{layout["footer"]}"')
    if layout.get("page_num_pos", "none") != "none":
        parts.append(f'Page numbers at {layout["page_num_pos"]} - REMOVE them')
    if layout.get("watermark"):
        parts.append(f'REMOVE watermark: "{layout["watermark"]}"')
    return "\n".join(parts) if parts else ""


def _parse_json(text: str) -> Optional[dict]:
    """Gemini sometimes wraps JSON in code fences or adds prose. Strip and try a few times."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Strip ```json ... ``` fences if present
    cleaned = re.sub(r'^```(?:json)?\s*\n?', '', text)
    cleaned = re.sub(r'\n?```\s*$', '', cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Last resort: scan for the first balanced {...} block
    depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == '{':
            if start == -1: start = i
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0 and start >= 0:
                try:
                    return json.loads(text[start:i + 1])
                except json.JSONDecodeError:
                    break
    return None


def _extract_chapters(text: str) -> list[dict]:
    """Pull [TITLE]...[/TITLE] and [HEADING]...[/HEADING] markers, sorted by position."""
    items = []
    for m in re.finditer(r'\[TITLE\](.*?)\[/TITLE\]', text):
        items.append({"title": m.group(1).strip(), "label": m.group(1).strip(),
                      "char_offset": m.start(), "type": "title"})
    for m in re.finditer(r'\[HEADING\](.*?)\[/HEADING\]', text):
        items.append({"title": m.group(1).strip(), "label": m.group(1).strip(),
                      "char_offset": m.start(), "type": "heading"})
    items.sort(key=lambda x: x["char_offset"])
    return items


def _strip_markers(text: str) -> str:
    t = re.sub(r'\[TITLE\]|\[/TITLE\]|\[HEADING\]|\[/HEADING\]', '', text)
    t = re.sub(r' {2,}', ' ', t)
    t = re.sub(r'\n{3,}', '\n\n', t)
    return t.strip()


def _find_content_start(text: str, chapters: list[dict], layout: dict) -> int:
    """Pick the char offset where 'real' content begins, skipping front matter.

    Order of preference: whatever the calibration step suggested, then
    Introduction, then Chapter 1, then Prologue, then any chapter past the
    first 5% of the document.
    """
    hint = (layout.get("content_start") or "").lower()
    if hint:
        for ch in chapters:
            if hint in ch["title"].lower():
                return ch["char_offset"]

    for ch in chapters:
        if "introduction" in ch["title"].lower():
            return ch["char_offset"]
    for ch in chapters:
        if re.match(r'(chapter\s+1\b|^1[\s.])', ch["title"].lower()):
            return ch["char_offset"]
    for ch in chapters:
        if "prologue" in ch["title"].lower():
            return ch["char_offset"]

    threshold = len(text) * 0.05
    for ch in chapters:
        if ch["char_offset"] > threshold:
            return ch["char_offset"]
    return 0
