"""PDF extraction pipeline.

The pipeline runs in 10 stages and tries to be smart about chapter
detection: built-in PDF bookmarks first, then a parsed text TOC, and
font-size analysis only as a last resort. Bookmarks are by far the most
reliable source when they exist (about half the books we tested had them).

Stage list:
  1. Spatial extraction       text blocks with bounding boxes (pymupdf)
  2. TOC extraction           bookmarks, then text TOC parsing
  3. Pattern filter           Gemini-identified header/footer text
  4. Repetition filter        text that shows up on most pages
  5. Positional filter        Gemini-calibrated header/footer zones
  6. Page number detector     regex patterns in the margins
  7. TOC-based heading marker tag blocks that match TOC entries
  8. Watermark detector       Gemini-identified or default keywords
  9. Reading order            column-aware sort
  10. Text assembly           merge titles, strip markers, normalize whitespace
"""

from __future__ import annotations

import re
import statistics
from collections import defaultdict
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import fitz  # pymupdf

from .gemini_calibrator import LayoutProfile


# Data Models
class BlockRole(str, Enum):
    TITLE = "title"
    HEADING = "heading"
    BODY = "body"
    CAPTION = "caption"
    FOOTNOTE = "footnote"
    HEADER = "header"
    FOOTER = "footer"
    PAGE_NUMBER = "page_number"
    WATERMARK = "watermark"
    TABLE = "table"
    LIST_ITEM = "list_item"
    UNKNOWN = "unknown"


@dataclass
class TextBlock:
    text: str
    page_num: int
    x0: float
    y0: float
    x1: float
    y1: float
    font_name: str = ""
    font_size: float = 0.0
    is_bold: bool = False
    is_italic: bool = False
    color: int = 0
    role: BlockRole = BlockRole.UNKNOWN
    confidence: float = 0.0

    @property
    def width(self): return self.x1 - self.x0
    @property
    def height(self): return self.y1 - self.y0
    @property
    def center_x(self): return (self.x0 + self.x1) / 2
    @property
    def center_y(self): return (self.y0 + self.y1) / 2
    @property
    def normalized_text(self):
        return re.sub(r'\s+', ' ', self.text.strip().lower())


@dataclass
class PageLayout:
    page_num: int
    width: float
    height: float
    blocks: list[TextBlock] = field(default_factory=list)
    body_blocks: list[TextBlock] = field(default_factory=list)
    filtered_blocks: list[TextBlock] = field(default_factory=list)


@dataclass
class TOCEntry:
    title: str
    level: int  # 1=chapter, 2=section, 3=subsection
    page: int   # 0-indexed page number


@dataclass
class DocumentContent:
    title: str = ""
    pages: list[PageLayout] = field(default_factory=list)
    clean_text: str = ""
    chapter_breaks: list[int] = field(default_factory=list)
    total_pages: int = 0
    word_count: int = 0
    estimated_read_time_minutes: float = 0.0
    content_start_offset: int = 0
    chapters_with_offsets: list[dict] = field(default_factory=list)
    gemini_profile: Optional[dict] = None
    toc_source: str = ""  # "bookmarks", "text", "font", or "none"


# Stage 1: Spatial Extraction
class SpatialExtractor:
    def extract(self, pdf_path: str) -> list[PageLayout]:
        doc = fitz.open(pdf_path)
        pages: list[PageLayout] = []

        for page_num in range(len(doc)):
            page = doc[page_num]
            rect = page.rect
            layout = PageLayout(page_num=page_num, width=rect.width, height=rect.height)

            page_dict = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)

            for block in page_dict.get("blocks", []):
                if block["type"] != 0:
                    continue
                for line in block.get("lines", []):
                    spans_data = []
                    is_bold = is_italic = False
                    color = 0

                    for span in line.get("spans", []):
                        t = span.get("text", "")
                        if not t.strip():
                            continue
                        spans_data.append({
                            "text": t,
                            "bbox": span.get("bbox", [0, 0, 0, 0]),
                            "size": span.get("size", 12),
                            "font": span.get("font", ""),
                        })
                        color = span.get("color", 0)
                        flags = span.get("flags", 0)
                        if flags & (1 << 4): is_bold = True
                        if flags & (1 << 1): is_italic = True

                    if not spans_data:
                        continue

                    # Smart span joining: use gap detection
                    full_text = spans_data[0]["text"]
                    for j in range(1, len(spans_data)):
                        prev = spans_data[j - 1]
                        curr = spans_data[j]
                        gap = curr["bbox"][0] - prev["bbox"][2]
                        avg_size = (prev["size"] + curr["size"]) / 2
                        if gap > avg_size * 0.3:
                            full_text += " " + curr["text"]
                        else:
                            full_text += curr["text"]

                    full_text = full_text.strip()
                    if not full_text:
                        continue

                    sizes = [s["size"] for s in spans_data]
                    fonts = [s["font"] for s in spans_data]
                    bbox = line["bbox"]
                    layout.blocks.append(TextBlock(
                        text=full_text, page_num=page_num,
                        x0=bbox[0], y0=bbox[1], x1=bbox[2], y1=bbox[3],
                        font_name=fonts[0] if fonts else "",
                        font_size=statistics.median(sizes) if sizes else 12,
                        is_bold=is_bold, is_italic=is_italic, color=color,
                    ))
            pages.append(layout)

        doc.close()
        return pages


# Stage 2: TOC Extraction
class TOCExtractor:
    """Extract table of contents from PDF bookmarks or text."""

    # Front matter entries to SKIP (not real chapters)
    FRONT_MATTER = {
        'title page', 'copyright', 'epigraph', 'dedication',
        'contents', 'table of contents', 'also by', 'praise for',
        'cover', 'half title', 'frontispiece',
    }

    def extract(self, pdf_path: str, pages: list[PageLayout]) -> list[TOCEntry]:
        """Try bookmarks first, then text-based TOC."""
        entries = self._from_bookmarks(pdf_path)
        if entries:
            return entries

        entries = self._from_text(pages)
        return entries

    def _from_bookmarks(self, pdf_path: str) -> list[TOCEntry]:
        """Read PDF's built-in bookmark/outline structure."""
        doc = fitz.open(pdf_path)
        raw_toc = doc.get_toc()
        doc.close()

        if not raw_toc:
            return []

        entries = []
        for level, title, page_num in raw_toc:
            title = title.strip()
            if not title:
                continue
            # Skip front matter
            if title.lower() in self.FRONT_MATTER:
                continue
            entries.append(TOCEntry(
                title=title,
                level=level,
                page=max(0, page_num - 1),  # PDF pages are 1-indexed in TOC
            ))

        return entries

    def _from_text(self, pages: list[PageLayout]) -> list[TOCEntry]:
        """Parse text-based TOC by finding "Contents" page."""
        # Find the contents page
        contents_page = -1
        for layout in pages[:15]:  # TOC is always in first 15 pages
            for block in layout.blocks:
                text = block.text.strip().lower()
                if text in ('contents', 'table of contents'):
                    contents_page = layout.page_num
                    break
            if contents_page >= 0:
                break

        if contents_page < 0:
            return []

        # Collect all text from the TOC page(s) - usually 1-3 pages
        toc_text_blocks = []
        for layout in pages:
            if layout.page_num < contents_page:
                continue
            if layout.page_num > contents_page + 3:
                break
            for block in layout.blocks:
                text = block.text.strip()
                if not text or text.lower() in ('contents', 'table of contents'):
                    continue
                toc_text_blocks.append(text)

        # Parse entries - each block is likely a TOC entry
        entries = []
        for text in toc_text_blocks:
            # Strip trailing page numbers: "Chapter 1. The Power of Habits 23", "Chapter 1. The Power of Habits"
            cleaned = re.sub(r'\s+\d{1,4}\s*$', '', text).strip()
            # Strip leading numbers/dots: "1. The Power", "The Power" (keep "Chapter 1")
            if cleaned.lower() in self.FRONT_MATTER:
                continue
            if not cleaned or len(cleaned) < 2:
                continue
            entries.append(TOCEntry(title=cleaned, level=1, page=0))

        return entries


# Stage 3: Pattern Filter (Gemini)
class PatternFilter:
    def __init__(self, profile: LayoutProfile):
        self.header_patterns = [h.strip().lower() for h in profile.header_texts if h.strip()]
        self.footer_patterns = [f.strip().lower() for f in profile.footer_texts if f.strip()]

    def apply(self, pages: list[PageLayout]) -> list[PageLayout]:
        for layout in pages:
            for block in layout.blocks:
                if block.role != BlockRole.UNKNOWN:
                    continue
                text_lower = block.normalized_text
                for hp in self.header_patterns:
                    if hp in text_lower or text_lower in hp:
                        block.role = BlockRole.HEADER
                        block.confidence = 0.95
                        break
                if block.role != BlockRole.UNKNOWN:
                    continue
                for fp in self.footer_patterns:
                    if fp in text_lower or text_lower in fp:
                        block.role = BlockRole.FOOTER
                        block.confidence = 0.95
                        break
        return pages


# Stage 4: Repetition Filter
class RepetitionFilter:
    def __init__(self, threshold: float = 0.5):
        self.threshold = threshold

    def apply(self, pages: list[PageLayout]) -> list[PageLayout]:
        if len(pages) < 3:
            return pages
        text_page_counts: dict[str, set[int]] = defaultdict(set)
        for layout in pages:
            for block in layout.blocks:
                if block.role != BlockRole.UNKNOWN:
                    continue
                n = block.normalized_text
                if len(n) < 2:
                    continue
                base = re.sub(r'\d+\s*$', '', n).strip()
                text_page_counts[n].add(layout.page_num)
                if base and base != n:
                    text_page_counts[base].add(layout.page_num)
        min_pages = max(3, int(len(pages) * self.threshold))
        repetitive = {t for t, ps in text_page_counts.items() if len(ps) >= min_pages}
        for layout in pages:
            for block in layout.blocks:
                if block.role != BlockRole.UNKNOWN:
                    continue
                n = block.normalized_text
                base = re.sub(r'\d+\s*$', '', n).strip()
                if n in repetitive or base in repetitive:
                    mid = layout.height / 2
                    block.role = BlockRole.HEADER if block.center_y < mid else BlockRole.FOOTER
                    block.confidence = 0.85
        return pages


# Stage 5: Positional Filter
class PositionalFilter:
    def __init__(self, profile: LayoutProfile):
        self.header_pct = profile.header_zone_pct
        self.footer_pct = profile.footer_zone_pct

    def apply(self, pages: list[PageLayout]) -> list[PageLayout]:
        for layout in pages:
            h_thresh = layout.height * self.header_pct
            f_thresh = layout.height * (1 - self.footer_pct)
            for block in layout.blocks:
                if block.role != BlockRole.UNKNOWN:
                    continue
                if block.y1 < h_thresh:
                    block.role = BlockRole.HEADER
                    block.confidence = max(block.confidence, 0.70)
                elif block.y0 > f_thresh:
                    block.role = BlockRole.FOOTER
                    block.confidence = max(block.confidence, 0.70)
        return pages


# Stage 6: Page Number Detector
class PageNumberDetector:
    PATTERNS = [
        re.compile(p, re.IGNORECASE) for p in [
            r'^\s*\d{1,4}\s*$', r'^\s*-\s*\d{1,4}\s*-\s*$',
            r'^\s*page\s+\d{1,4}\s*$', r'^\s*\d{1,4}\s+of\s+\d{1,4}\s*$',
            r'^\s*p\.\s*\d{1,4}\s*$', r'^\s*[ivxlcdm]+\s*$',
            r'^\s*\[\d{1,4}\]\s*$',
        ]
    ]

    def apply(self, pages: list[PageLayout]) -> list[PageLayout]:
        for layout in pages:
            h_zone = layout.height * 0.12
            f_zone = layout.height * 0.88
            for block in layout.blocks:
                in_zone = block.y1 < h_zone or block.y0 > f_zone
                already = block.role in (BlockRole.HEADER, BlockRole.FOOTER)
                if not (in_zone or already):
                    continue
                if any(p.match(block.text.strip()) for p in self.PATTERNS):
                    block.role = BlockRole.PAGE_NUMBER
                    block.confidence = 0.95
        return pages


# Stage 7: TOC-Based Heading Detector
class TOCHeadingDetector:
    """
    Mark text blocks as TITLE/HEADING only if they match a TOC entry.
    This is the KEY difference from the old approach - no font guessing.
    Falls back to font-based detection ONLY if no TOC was found.
    """

    STRUCTURE_EXACT = {
        'introduction', 'preface', 'foreword', 'prologue', 'epilogue',
        'afterword', 'appendix', 'conclusion', 'acknowledgments',
        'acknowledgements', 'bibliography', 'references', 'glossary',
        'about the author', 'about the authors', "author's note",
    }

    def __init__(self, toc_entries: list[TOCEntry], profile: LayoutProfile):
        self.toc_entries = toc_entries
        self.has_toc = len(toc_entries) > 0
        self.profile = profile

        # Build normalized title lookup
        self.toc_titles = {}
        for entry in toc_entries:
            normalized = re.sub(r'\s+', ' ', entry.title.strip().lower())
            self.toc_titles[normalized] = entry

    def apply(self, pages: list[PageLayout]) -> list[PageLayout]:
        if self.has_toc:
            return self._match_toc(pages)
        else:
            return self._fallback_font(pages)

    def _match_toc(self, pages: list[PageLayout]) -> list[PageLayout]:
        """Match blocks against TOC entries.
        STRICT matching - block text must closely match a TOC entry title."""
        for layout in pages:
            for block in layout.blocks:
                if block.role != BlockRole.UNKNOWN:
                    continue
                text = block.text.strip()
                text_lower = re.sub(r'\s+', ' ', text.lower())
                wc = len(text.split())

                # Skip long text - chapters/headings are always short
                if wc > 15:
                    continue

                # Exact match against TOC entry
                if text_lower in self.toc_titles:
                    entry = self.toc_titles[text_lower]
                    block.role = BlockRole.TITLE if entry.level == 1 else BlockRole.HEADING
                    block.confidence = 0.95
                    continue

                # Check if block is a COMPONENT of a multi-part TOC entry
                # e.g., TOC has "Introduction: My Story" but PDF has two blocks:
                #   Block 1: "Introduction", TITLE (it's the main part)
                #   Block 2: "My Story"    , HEADING (it's the subtitle)
                for toc_key, entry in self.toc_titles.items():
                    # Split TOC entries like "Chapter 1: Introduction" or
                    # "Chapter 1 - Introduction" into the main part and the
                    # subtitle so we can match either piece.
                    sep_match = re.split(r'\s*[:\-]\s*', toc_key, maxsplit=1)
                    if len(sep_match) >= 2:
                        main_part = sep_match[0].strip()
                        sub_part = sep_match[1].strip()
                        if text_lower == main_part:
                            block.role = BlockRole.TITLE
                            block.confidence = 0.92
                            break
                        if text_lower == sub_part:
                            block.role = BlockRole.HEADING
                            block.confidence = 0.88
                            break

                    # Also check if the ENTIRE block text equals the TOC key
                    # (handles slight whitespace/case differences)
                    if len(text_lower) > 5 and text_lower == toc_key:
                        block.role = BlockRole.TITLE if entry.level == 1 else BlockRole.HEADING
                        block.confidence = 0.90
                        break

                # Structure words
                if block.role == BlockRole.UNKNOWN and text_lower in self.STRUCTURE_EXACT:
                    block.role = BlockRole.HEADING
                    block.confidence = 0.85

        return pages

    def _fallback_font(self, pages: list[PageLayout]) -> list[PageLayout]:
        """Font-based detection - ONLY used when no TOC exists."""
        title_min = self.profile.title_font_size_min
        heading_min = self.profile.heading_font_size_min

        for layout in pages:
            for block in layout.blocks:
                if block.role != BlockRole.UNKNOWN:
                    continue
                text = block.text.strip()
                text_lower = text.lower().strip()
                wc = len(text.split())

                if re.match(r'^chapter\s+[\divxlc]+', text_lower) and wc <= 10:
                    block.role = BlockRole.TITLE
                    block.confidence = 0.90
                elif block.font_size >= title_min and wc <= 12:
                    block.role = BlockRole.TITLE
                    block.confidence = 0.85
                elif block.font_size >= heading_min and block.is_bold and wc <= 8:
                    block.role = BlockRole.HEADING
                    block.confidence = 0.80
                elif text_lower in self.STRUCTURE_EXACT:
                    block.role = BlockRole.HEADING
                    block.confidence = 0.85

        return pages


# Stage 8: Watermark Detector
class WatermarkDetector:
    DEFAULT_KEYWORDS = {"draft", "confidential", "copy", "sample", "preview",
                        "watermark", "do not distribute"}

    def __init__(self, profile: LayoutProfile):
        self.gemini_watermark = profile.watermark_text.strip().lower() if profile.watermark_text else ""

    def apply(self, pages: list[PageLayout]) -> list[PageLayout]:
        for layout in pages:
            for block in layout.blocks:
                if block.role != BlockRole.UNKNOWN:
                    continue
                t = block.text.strip().lower()
                big = block.font_size > 36
                wide = (block.width / layout.width > 0.6) if layout.width else False
                if self.gemini_watermark and self.gemini_watermark in t:
                    block.role = BlockRole.WATERMARK
                    block.confidence = 0.95
                elif any(kw in t for kw in self.DEFAULT_KEYWORDS) and (big or wide):
                    block.role = BlockRole.WATERMARK
                    block.confidence = 0.85
        return pages


# Stage 9: Reading Order
class ReadingOrderSorter:
    def __init__(self, profile: LayoutProfile):
        self.num_columns = profile.has_columns
        self.y_tolerance = 5.0

    def sort_page(self, blocks: list[TextBlock], page_width: float) -> list[TextBlock]:
        if not blocks:
            return blocks
        if self.num_columns > 1:
            columns = self._detect_columns(blocks, page_width)
            if len(columns) > 1:
                result = []
                for col in columns:
                    result.extend(self._sort_single(col))
                return result
        return self._sort_single(blocks)

    def _detect_columns(self, blocks: list[TextBlock], pw: float) -> list[list[TextBlock]]:
        if len(blocks) < 4:
            return [blocks]
        x_pos = sorted(set(round(b.x0 / 10) * 10 for b in blocks))
        if len(x_pos) < 2:
            return [blocks]
        gaps = [(x_pos[i - 1] + (x_pos[i] - x_pos[i - 1]) / 2)
                for i in range(1, len(x_pos)) if x_pos[i] - x_pos[i - 1] > pw * 0.15]
        if not gaps:
            return [blocks]
        bounds = [0] + gaps + [pw]
        cols: list[list[TextBlock]] = [[] for _ in range(len(bounds) - 1)]
        for b in blocks:
            for i in range(len(bounds) - 1):
                if bounds[i] <= b.center_x < bounds[i + 1]:
                    cols[i].append(b)
                    break
        return [c for c in cols if c]

    def _sort_single(self, blocks: list[TextBlock]) -> list[TextBlock]:
        sorted_b = sorted(blocks, key=lambda b: b.y0)
        if not sorted_b:
            return sorted_b
        bands: list[list[TextBlock]] = [[sorted_b[0]]]
        for b in sorted_b[1:]:
            avg_y = statistics.mean(x.y0 for x in bands[-1])
            if abs(b.y0 - avg_y) <= self.y_tolerance:
                bands[-1].append(b)
            else:
                bands.append([b])
        result = []
        for band in bands:
            band.sort(key=lambda b: b.x0)
            result.extend(band)
        return result


# Stage 10: Text Assembly
class TextAssembler:
    def assemble(self, pages: list[PageLayout], toc_entries: list = None) -> tuple[str, list[dict], dict[int, int]]:
        """Returns (display_text, chapters, page_offsets).
        page_offsets: {page_num: char_offset_in_display_text}"""
        parts: list[str] = []
        page_nums: list[int] = []
        prev_role = None

        for layout in pages:
            page_parts: list[str] = []
            for block in layout.body_blocks:
                t = block.text.strip()
                if not t:
                    continue
                if block.role == BlockRole.TITLE:
                    if prev_role == BlockRole.TITLE and page_parts:
                        page_parts[-1] = page_parts[-1].replace("[/TITLE]\n", f" {t}[/TITLE]\n")
                    else:
                        page_parts.append(f"\n\n[TITLE]{t}[/TITLE]\n")
                elif block.role == BlockRole.HEADING:
                    page_parts.append(f"\n\n[HEADING]{t}[/HEADING]\n")
                elif block.role == BlockRole.LIST_ITEM:
                    page_parts.append(f"  {t}")
                else:
                    page_parts.append(t)
                prev_role = block.role
            if page_parts:
                parts.append("\n".join(page_parts))
                page_nums.append(layout.page_num)

        marker_text = "\n\n".join(parts)
        marker_text = self._clean(marker_text)
        chapters = self._extract_chapters(marker_text, toc_entries)
        display_text = self._strip_markers(marker_text)

        # Build page, char offset map in display_text
        page_offsets: dict[int, int] = {}
        offset = 0
        for i, part in enumerate(parts):
            stripped = self._strip_markers(self._clean(part))
            if i < len(page_nums) and page_nums[i] not in page_offsets:
                page_offsets[page_nums[i]] = offset
            offset += len(stripped) + 2

        # Fix chapter offsets to point into display_text
        for ch in chapters:
            pos = display_text.find(ch["title"])
            if pos < 0:
                pos = display_text.lower().find(ch["title"].lower())
            ch["char_offset"] = pos if pos >= 0 else 0

        return display_text, chapters, page_offsets

    def _clean(self, text: str) -> str:
        text = text.replace('\n\n', '\x00PARA\x00')
        text = text.replace('\n', ' ')
        text = text.replace('\x00PARA\x00', '\n\n')
        text = re.sub(r' {2,}', ' ', text)
        text = re.sub(r'\n{3,}', '\n\n', text)
        return text.strip()

    @staticmethod
    def _strip_markers(text: str) -> str:
        t = re.sub(r'\[TITLE\]|\[/TITLE\]|\[HEADING\]|\[/HEADING\]', '', text)
        return re.sub(r' {2,}', ' ', t)

    @staticmethod
    def _extract_chapters(text: str, toc_entries: list = None) -> list[dict]:
        """Extract chapters from markers. Use TOC entry names when available."""
        items = []

        # Build a lookup from title text, TOC entry label
        toc_labels = {}
        if toc_entries:
            for entry in toc_entries:
                toc_labels[entry.title.lower().strip()] = entry.title

        for match in re.finditer(r'\[TITLE\](.*?)\[/TITLE\]', text):
            name = match.group(1).strip()
            # Use TOC label if available, otherwise use the text as-is
            label = toc_labels.get(name.lower().strip(), name)
            items.append({
                "title": name, "label": label,
                "char_offset": match.start(), "type": "title",
            })

        for match in re.finditer(r'\[HEADING\](.*?)\[/HEADING\]', text):
            name = match.group(1).strip()
            label = toc_labels.get(name.lower().strip(), name)
            items.append({
                "title": name, "label": label,
                "char_offset": match.start(), "type": "heading",
            })

        items.sort(key=lambda x: x["char_offset"])
        return items


# Main Pipeline
class PDFProcessingPipeline:
    def __init__(self, profile: Optional[LayoutProfile] = None):
        self.profile = profile or LayoutProfile()
        self.extractor = SpatialExtractor()
        self.toc_extractor = TOCExtractor()
        self.pattern_filter = PatternFilter(self.profile)
        self.repetition_filter = RepetitionFilter()
        self.positional_filter = PositionalFilter(self.profile)
        self.page_number_detector = PageNumberDetector()
        self.watermark_detector = WatermarkDetector(self.profile)
        self.reading_order = ReadingOrderSorter(self.profile)
        self.assembler = TextAssembler()

    def process(self, pdf_path: str) -> DocumentContent:
        pages = self.extractor.extract(pdf_path)
        if not pages:
            return DocumentContent(total_pages=0)

        # Extract TOC - source of truth for chapters
        toc_entries = self.toc_extractor.extract(pdf_path, pages)
        toc_source = "bookmarks" if toc_entries and any(e.page > 0 for e in toc_entries) else \
                     "text" if toc_entries else "font"

        # Find content start PAGE from TOC bookmarks
        content_start_page = self._find_content_start_page(toc_entries)

        # Build heading detector with TOC data
        heading_detector = TOCHeadingDetector(toc_entries, self.profile)

        # Run filter stages
        pages = self.pattern_filter.apply(pages)
        pages = self.repetition_filter.apply(pages)
        pages = self.positional_filter.apply(pages)
        pages = self.page_number_detector.apply(pages)
        pages = heading_detector.apply(pages)
        pages = self.watermark_detector.apply(pages)

        # Classify remaining blocks as body
        non_body = {BlockRole.HEADER, BlockRole.FOOTER, BlockRole.PAGE_NUMBER, BlockRole.WATERMARK}
        for layout in pages:
            for b in layout.blocks:
                if b.role == BlockRole.UNKNOWN:
                    b.role = BlockRole.BODY
            layout.body_blocks = [b for b in layout.blocks if b.role not in non_body]
            layout.filtered_blocks = [b for b in layout.blocks if b.role in non_body]
            layout.body_blocks = self.reading_order.sort_page(layout.body_blocks, layout.width)

        # Assemble text with page tracking
        display_text, chapters, page_offsets = self.assembler.assemble(pages, toc_entries)

        # Compute content_start_offset from the page number
        content_start = 0
        if content_start_page >= 0 and content_start_page in page_offsets:
            content_start = page_offsets[content_start_page]
        elif chapters:
            content_start = self._fallback_content_start(chapters)

        # Document title
        title = ""
        for layout in pages[:3]:
            for b in layout.body_blocks:
                if b.role == BlockRole.TITLE:
                    title = b.text.strip()
                    break
            if title:
                break

        chapter_breaks = [
            l.page_num for l in pages
            if any(b.role == BlockRole.TITLE for b in l.body_blocks)
        ]

        wc = len(display_text.split())
        return DocumentContent(
            title=title, pages=pages, clean_text=display_text,
            chapter_breaks=chapter_breaks, total_pages=len(pages),
            word_count=wc, estimated_read_time_minutes=round(wc / 200, 1),
            content_start_offset=content_start,
            chapters_with_offsets=chapters,
            gemini_profile=self.profile.__dict__ if self.profile else None,
            toc_source=toc_source,
        )

    def _find_content_start_page(self, toc_entries: list[TOCEntry]) -> int:
        """Find content start page from TOC bookmarks.
        Priority: Introduction, Chapter 1, Prologue, first entry past page 5."""
        if not toc_entries:
            return -1

        for entry in toc_entries:
            if 'introduction' in entry.title.lower():
                return entry.page

        for entry in toc_entries:
            title_lower = entry.title.lower()
            if re.match(r'(chapter\s+1\b|^1[\s.])', title_lower):
                return entry.page

        for entry in toc_entries:
            if any(kw in entry.title.lower() for kw in ('prologue', 'my story', 'the fundamentals')):
                return entry.page

        # First entry after page 5
        for entry in toc_entries:
            if entry.page > 5:
                return entry.page

        return -1

    def _fallback_content_start(self, chapters: list[dict]) -> int:
        """Fallback when no TOC page numbers available."""
        for ch in chapters:
            if 'introduction' in ch["title"].lower():
                return ch["char_offset"]
        for ch in chapters:
            if re.match(r'(chapter\s+1\b|^1[\s.])', ch["title"].lower()):
                return ch["char_offset"]
        return 0
