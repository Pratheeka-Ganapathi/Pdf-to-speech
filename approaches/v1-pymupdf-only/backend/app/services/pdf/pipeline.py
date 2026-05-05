"""Heuristic PDF extraction pipeline.

Pulls body text out of a PDF and tries to drop the noise (running
headers and footers, page numbers, watermarks). Pure heuristics, no
model calls. Works well on simple academic-style PDFs and falls down
on real published books where the noise patterns are book-specific.

Stages:
  1. Spatial extraction      pymupdf gives us text blocks with bboxes
  2. Repetition filter       text that appears on most pages = header/footer
  3. Positional filter       top/bottom 8% of the page is suspect
  4. Page number detector    7-ish regex patterns
  5. Heading detector        font-size outliers
  6. Watermark detector      big light-colored text spanning the page
  7. Reading order           column-aware sort
  8. Text assembly           paragraphs ready for TTS
"""

from __future__ import annotations

import re
import statistics
from collections import defaultdict
from dataclasses import dataclass, field
from enum import Enum

import fitz  # pymupdf


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
    def width(self) -> float:
        return self.x1 - self.x0

    @property
    def height(self) -> float:
        return self.y1 - self.y0

    @property
    def center_x(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def center_y(self) -> float:
        return (self.y0 + self.y1) / 2

    @property
    def normalized_text(self) -> str:
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
class DocumentContent:
    title: str = ""
    pages: list[PageLayout] = field(default_factory=list)
    clean_text: str = ""
    chapter_breaks: list[int] = field(default_factory=list)
    total_pages: int = 0
    word_count: int = 0
    estimated_read_time_minutes: float = 0.0
    content_start_offset: int = 0  # char offset where main content begins
    chapters_with_offsets: list[dict] = field(default_factory=list)  # [{title, char_offset}]


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
                    parts, sizes, fonts = [], [], []
                    is_bold = is_italic = False
                    color = 0

                    for span in line.get("spans", []):
                        t = span.get("text", "").strip()
                        if not t:
                            continue
                        parts.append(span["text"])
                        sizes.append(span.get("size", 12))
                        fonts.append(span.get("font", ""))
                        color = span.get("color", 0)
                        flags = span.get("flags", 0)
                        if flags & (1 << 4):
                            is_bold = True
                        if flags & (1 << 1):
                            is_italic = True

                    full_text = " ".join(parts).strip()
                    if not full_text:
                        continue

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


# Stage 2: Repetition Filter
class RepetitionFilter:
    def __init__(self, threshold: float = 0.5):
        self.threshold = threshold

    def apply(self, pages: list[PageLayout]) -> list[PageLayout]:
        if len(pages) < 3:
            return pages

        text_page_counts: dict[str, set[int]] = defaultdict(set)
        for layout in pages:
            for block in layout.blocks:
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
                n = block.normalized_text
                base = re.sub(r'\d+\s*$', '', n).strip()
                if n in repetitive or base in repetitive:
                    mid = layout.height / 2
                    block.role = BlockRole.HEADER if block.center_y < mid else BlockRole.FOOTER
                    block.confidence = 0.85

        return pages


# Stage 3: Positional Filter
class PositionalFilter:
    def __init__(self, header_zone_pct: float = 0.08, footer_zone_pct: float = 0.08):
        self.header_zone_pct = header_zone_pct
        self.footer_zone_pct = footer_zone_pct

    def apply(self, pages: list[PageLayout]) -> list[PageLayout]:
        for layout in pages:
            h_thresh = layout.height * self.header_zone_pct
            f_thresh = layout.height * (1 - self.footer_zone_pct)
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


# Stage 4: Page Number Detector
class PageNumberDetector:
    PATTERNS = [
        re.compile(p, re.IGNORECASE) for p in [
            r'^\s*\d{1,4}\s*$',
            r'^\s*-\s*\d{1,4}\s*-\s*$',
            r'^\s*page\s+\d{1,4}\s*$',
            r'^\s*\d{1,4}\s+of\s+\d{1,4}\s*$',
            r'^\s*p\.\s*\d{1,4}\s*$',
            r'^\s*[ivxlcdm]+\s*$',
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


# Stage 5: Heading Detector
class HeadingDetector:
    # Only match if the ENTIRE text (lowered, stripped) equals one of these
    STRUCTURE_EXACT = {
        'introduction', 'preface', 'foreword', 'prologue', 'epilogue',
        'afterword', 'appendix', 'conclusion', 'acknowledgments',
        'acknowledgements', 'bibliography', 'references', 'glossary',
        'about the author', 'about the authors', 'author\'s note',
        'part one', 'part two', 'part three', 'part four', 'part five',
        'part i', 'part ii', 'part iii', 'part iv', 'part v',
    }

    def apply(self, pages: list[PageLayout]) -> list[PageLayout]:
        sizes = [b.font_size for l in pages for b in l.blocks if b.role == BlockRole.UNKNOWN]
        if not sizes:
            return pages

        median = statistics.median(sizes)
        # Strict thresholds: headings must be clearly larger than body
        title_thresh = median * 1.8   # 80% larger = clearly a title
        heading_thresh = median * 1.4  # 40% larger AND bold = heading

        for layout in pages:
            for block in layout.blocks:
                if block.role != BlockRole.UNKNOWN:
                    continue
                text = block.text.strip()
                text_lower = text.lower().strip()
                wc = len(text.split())

                # "Chapter X" pattern - strongest signal
                if re.match(r'^chapter\s+[\divxlc]+', text_lower) and wc <= 10:
                    block.role = BlockRole.TITLE
                    block.confidence = 0.90
                # Very large font + short text = title
                elif block.font_size >= title_thresh and wc <= 12:
                    block.role = BlockRole.TITLE
                    block.confidence = 0.80
                # Large font + bold + short = heading
                elif block.font_size >= heading_thresh and block.is_bold and wc <= 8:
                    block.role = BlockRole.HEADING
                    block.confidence = 0.75
                # Exact match structure words (must be the WHOLE block text)
                elif text_lower in self.STRUCTURE_EXACT:
                    block.role = BlockRole.HEADING
                    block.confidence = 0.85

        return pages


# Stage 6: Watermark Detector
class WatermarkDetector:
    KEYWORDS = {"draft", "confidential", "copy", "sample", "preview", "watermark", "do not distribute"}

    def apply(self, pages: list[PageLayout]) -> list[PageLayout]:
        for layout in pages:
            for block in layout.blocks:
                if block.role != BlockRole.UNKNOWN:
                    continue
                t = block.text.strip().lower()
                wide = (block.width / layout.width > 0.6) if layout.width else False
                big = block.font_size > 36
                is_wm = any(kw in t for kw in self.KEYWORDS)
                light = block.color > 0xAAAAAA if block.color else False

                if is_wm and (big or wide):
                    block.role = BlockRole.WATERMARK
                    block.confidence = 0.90
                elif light and big:
                    block.role = BlockRole.WATERMARK
                    block.confidence = 0.75
        return pages


# Stage 7: Reading Order
class ReadingOrderSorter:
    def __init__(self, y_tolerance: float = 5.0):
        self.y_tolerance = y_tolerance

    def sort_page(self, blocks: list[TextBlock], page_width: float) -> list[TextBlock]:
        if not blocks:
            return blocks
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


# Stage 8: Text Assembly
class TextAssembler:
    def assemble(self, pages: list[PageLayout]) -> str:
        parts: list[str] = []
        for layout in pages:
            page_parts: list[str] = []
            prev_role = None
            for block in layout.body_blocks:
                t = block.text.strip()
                if not t:
                    continue
                if block.role == BlockRole.TITLE:
                    if prev_role == BlockRole.TITLE and page_parts:
                        # Merge with previous title: "THE" + "MAN WHO...", one title
                        page_parts[-1] = page_parts[-1].replace("[/TITLE]\n", f" {t}[/TITLE]\n")
                    else:
                        page_parts.append(f"\n\n[TITLE]{t}[/TITLE]\n")
                elif block.role == BlockRole.HEADING:
                    if prev_role == BlockRole.HEADING and page_parts:
                        page_parts[-1] = page_parts[-1].replace("[/HEADING]\n", f" {t}[/HEADING]\n")
                    else:
                        page_parts.append(f"\n\n[HEADING]{t}[/HEADING]\n")
                elif block.role == BlockRole.LIST_ITEM:
                    page_parts.append(f"  {t}")
                else:
                    page_parts.append(t)
                prev_role = block.role
            if page_parts:
                parts.append("\n".join(page_parts))

        raw = "\n\n".join(parts)
        return self._post_process(raw)

    # Common ligature glyphs that PyMuPDF leaves intact in body text.
    # Without expanding these, TTS engines either skip them or read them
    # as the wrong word.
    LIGATURES = {
        '\ufb00': 'ff', '\ufb01': 'fi', '\ufb02': 'fl',
        '\ufb03': 'ffi', '\ufb04': 'ffl',
        '\ufb05': 'st', '\ufb06': 'st',
    }

    def _post_process(self, text: str) -> str:
        """Tidy up the assembled text for display and TTS.

        Three things on top of basic whitespace handling:
          1. Heal words broken across line boundaries by hyphenation
             ("knowl-\\nedge" -> "knowledge").
          2. Expand fi/fl/ffi ligatures that the PDF font kept as a
             single Unicode glyph.
          3. Convert single newlines to spaces while preserving paragraph
             breaks (a single \\n in a PDF is usually just a line wrap,
             not a real paragraph boundary).
        """
        # Heal hyphenated line breaks. Match a lowercase letter, then
        # hyphen + newline + optional whitespace + lowercase letter.
        text = re.sub(r'([a-z])-\n\s*([a-z])', r'\1\2', text)

        # Expand ligatures
        for glyph, replacement in self.LIGATURES.items():
            text = text.replace(glyph, replacement)

        # Preserve paragraph breaks while turning intra-paragraph newlines
        # into spaces.
        text = text.replace('\n\n', '\x00PARA\x00')
        text = text.replace('\n', ' ')
        text = text.replace('\x00PARA\x00', '\n\n')

        text = re.sub(r' {2,}', ' ', text)
        text = re.sub(r'\n{3,}', '\n\n', text)

        return text.strip()


# Main Pipeline
class PDFProcessingPipeline:
    """
    Usage:
        pipeline = PDFProcessingPipeline()
        result = pipeline.process("document.pdf")
        print(result.clean_text)
        print(result.word_count)
    """

    def __init__(self):
        self.extractor = SpatialExtractor()
        self.repetition_filter = RepetitionFilter()
        self.positional_filter = PositionalFilter()
        self.page_number_detector = PageNumberDetector()
        self.heading_detector = HeadingDetector()
        self.watermark_detector = WatermarkDetector()
        self.reading_order = ReadingOrderSorter()
        self.assembler = TextAssembler()

    def process(self, pdf_path: str) -> DocumentContent:
        pages = self.extractor.extract(pdf_path)
        if not pages:
            return DocumentContent(total_pages=0)

        # Run all filter stages
        pages = self.repetition_filter.apply(pages)
        pages = self.positional_filter.apply(pages)
        pages = self.page_number_detector.apply(pages)
        pages = self.heading_detector.apply(pages)
        pages = self.watermark_detector.apply(pages)

        # Classify and separate
        non_body = {BlockRole.HEADER, BlockRole.FOOTER, BlockRole.PAGE_NUMBER, BlockRole.WATERMARK}
        for layout in pages:
            for b in layout.blocks:
                if b.role == BlockRole.UNKNOWN:
                    b.role = BlockRole.BODY
            layout.body_blocks = [b for b in layout.blocks if b.role not in non_body]
            layout.filtered_blocks = [b for b in layout.blocks if b.role in non_body]
            layout.body_blocks = self.reading_order.sort_page(layout.body_blocks, layout.width)

        clean_text = self.assembler.assemble(pages)

        chapter_breaks = [
            l.page_num for l in pages
            if any(b.role == BlockRole.TITLE for b in l.body_blocks)
        ]

        title = ""
        for layout in pages[:3]:
            for b in layout.body_blocks:
                if b.role == BlockRole.TITLE:
                    title = b.text.strip()
                    break
            if title:
                break

        # Detect content start: skip metadata (copyright, ISBN, TOC, etc.)
        content_start = self._detect_content_start(clean_text)

        # Map chapter/heading positions from markers
        chapters_with_offsets = self._map_chapter_offsets(clean_text)

        # NOW strip all markers from clean_text - from here on, text is marker-free
        # and all offsets must be recomputed in this clean space
        display_text = self._strip_markers(clean_text)

        # Recompute chapter offsets in marker-free text
        for ch in chapters_with_offsets:
            # Find the chapter title in the stripped text
            pos = display_text.find(ch["title"])
            if pos >= 0:
                ch["char_offset"] = pos
            else:
                # Fuzzy: search case-insensitive
                pos = display_text.lower().find(ch["title"].lower())
                ch["char_offset"] = pos if pos >= 0 else 0

        # Recompute content_start in marker-free text
        content_start = self._detect_content_start_clean(display_text, chapters_with_offsets)

        wc = len(display_text.split())
        return DocumentContent(
            title=title, pages=pages, clean_text=display_text,
            chapter_breaks=chapter_breaks, total_pages=len(pages),
            word_count=wc, estimated_read_time_minutes=round(wc / 200, 1),
            content_start_offset=content_start,
            chapters_with_offsets=chapters_with_offsets,
        )

    @staticmethod
    def _strip_markers(text: str) -> str:
        """Remove all [TITLE]/[HEADING] markers, keep the text inside."""
        t = re.sub(r'\[TITLE\]', '', text)
        t = re.sub(r'\[/TITLE\]', '', t)
        t = re.sub(r'\[HEADING\]', '', t)
        t = re.sub(r'\[/HEADING\]', '', t)
        # Collapse any resulting double-spaces
        t = re.sub(r' {2,}', ' ', t)
        return t

    def _detect_content_start_clean(self, text: str, chapters: list[dict]) -> int:
        """Find content start in marker-free text by locating first real chapter."""
        metadata_keywords = [
            'copyright', 'isbn', 'all rights reserved', 'published by',
            'library of congress', 'table of contents', 'contents',
            'dedication', 'acknowledgment', 'imprint', 'edition',
            'printed in', 'version_', 'ebook isbn',
        ]
        paragraphs = text.split("\n\n")
        offset = 0
        last_metadata_end = 0

        for para in paragraphs:
            stripped = para.strip().lower()
            is_meta = any(kw in stripped for kw in metadata_keywords)
            if is_meta:
                last_metadata_end = offset + len(para) + 2
            offset += len(para) + 2
            if offset > len(text) * 0.15:
                break

        # If we found metadata, use first chapter after it as content start
        if last_metadata_end > 0 and chapters:
            for ch in chapters:
                if ch["char_offset"] >= last_metadata_end:
                    return ch["char_offset"]

        return last_metadata_end if last_metadata_end > 0 else 0

    def _detect_content_start(self, text: str) -> int:
        """Find where main content starts (after copyright, TOC, ISBN, etc.)."""
        metadata_keywords = [
            'copyright', 'isbn', 'all rights reserved', 'published by',
            'library of congress', 'table of contents', 'contents',
            'dedication', 'acknowledgment', 'imprint', 'edition',
            'printed in', 'version_', 'ebook isbn',
        ]
        paragraphs = text.split("\n\n")
        offset = 0
        last_metadata_end = 0

        for para in paragraphs:
            stripped = para.strip().lower()
            # Check if this paragraph is metadata
            is_meta = any(kw in stripped for kw in metadata_keywords)
            # Also: very short paragraphs at the start that look like front matter
            is_front = len(stripped.split()) < 5 and offset < len(text) * 0.1

            if is_meta or (is_front and offset < 3000):
                last_metadata_end = offset + len(para) + 2

            # If we find a [TITLE] or [HEADING] after metadata, that's content start
            if '[TITLE]' in para or '[HEADING]' in para:
                if last_metadata_end > 0 and offset > last_metadata_end:
                    return offset

            offset += len(para) + 2

            # Don't scan more than first 15% of document
            if offset > len(text) * 0.15:
                break

        return last_metadata_end if last_metadata_end > 0 else 0

    def _map_chapter_offsets(self, text: str) -> list[dict]:
        """Find all [TITLE] and [HEADING] markers with their char offsets.
        Labels titles as 'Chapter 1: Name', headings as section names."""
        items = []
        title_num = 0

        for match in re.finditer(r'\[TITLE\](.*?)\[/TITLE\]', text):
            name = match.group(1).strip()
            title_num += 1
            items.append({
                "title": name,
                "label": f"Chapter {title_num}: {name}",
                "char_offset": match.start(),
                "type": "title",
            })

        for match in re.finditer(r'\[HEADING\](.*?)\[/HEADING\]', text):
            name = match.group(1).strip()
            items.append({
                "title": name,
                "label": name,  # Headings keep their original name
                "char_offset": match.start(),
                "type": "heading",
            })

        items.sort(key=lambda x: x["char_offset"])

        # Re-number chapters sequentially after sorting
        ch_num = 0
        for item in items:
            if item["type"] == "title":
                ch_num += 1
                item["label"] = f"Chapter {ch_num}: {item['title']}"

        return items
