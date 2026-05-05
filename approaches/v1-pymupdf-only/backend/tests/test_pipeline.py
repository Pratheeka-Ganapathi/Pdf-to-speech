"""Tests for the heuristic PDF processing pipeline.

Covers the filtering logic that lives at the core of v1:
- Repetition filter catches headers/footers repeating across pages
- Positional filter catches blocks in header/footer zones
- Page number detector matches various patterns
- Watermark detector catches large overlay text
- Reading order correctly handles multi-column layouts
"""

import pytest
from app.services.pdf.pipeline import (
    TextBlock,
    PageLayout,
    BlockRole,
    RepetitionFilter,
    PositionalFilter,
    PageNumberDetector,
    HeadingDetector,
    WatermarkDetector,
    ReadingOrderSorter,
    TextAssembler,
)


# Helpers
def make_block(
    text: str,
    page: int = 0,
    y0: float = 100,
    y1: float = 120,
    x0: float = 50,
    x1: float = 300,
    font_size: float = 12,
    is_bold: bool = False,
    color: int = 0,
    role: BlockRole = BlockRole.UNKNOWN,
) -> TextBlock:
    return TextBlock(
        text=text,
        page_num=page,
        x0=x0, y0=y0, x1=x1, y1=y1,
        font_size=font_size,
        is_bold=is_bold,
        color=color,
        role=role,
    )


def make_page(
    page_num: int,
    blocks: list[TextBlock],
    height: float = 800,
    width: float = 600,
) -> PageLayout:
    return PageLayout(
        page_num=page_num,
        width=width,
        height=height,
        blocks=blocks,
    )


# Repetition Filter Tests
class TestRepetitionFilter:
    def test_detects_repeated_header(self):
        """Text appearing on 50%+ of pages is flagged."""
        pages = []
        for i in range(10):
            blocks = [
                make_block("Company Name Inc.", page=i, y0=10, y1=25),
                make_block("Body text for this page.", page=i, y0=200, y1=220),
            ]
            pages.append(make_page(i, blocks))

        filt = RepetitionFilter(threshold=0.5)
        result = filt.apply(pages)

        # "Company Name Inc." should be flagged
        for page in result:
            header_block = page.blocks[0]
            assert header_block.role == BlockRole.HEADER

    def test_ignores_unique_text(self):
        """Text that only appears once should not be flagged."""
        pages = []
        for i in range(5):
            blocks = [
                make_block(f"Unique paragraph {i}.", page=i, y0=200, y1=220),
            ]
            pages.append(make_page(i, blocks))

        filt = RepetitionFilter(threshold=0.5)
        result = filt.apply(pages)

        for page in result:
            assert page.blocks[0].role == BlockRole.UNKNOWN

    def test_handles_page_number_variations(self):
        """'Chapter 1 - Page 1', 'Chapter 1 - Page 2' should match base text."""
        pages = []
        for i in range(6):
            blocks = [
                make_block(f"Chapter 1 - Page {i + 1}", page=i, y0=10, y1=25),
                make_block("Body text.", page=i, y0=200, y1=220),
            ]
            pages.append(make_page(i, blocks))

        filt = RepetitionFilter(threshold=0.5)
        result = filt.apply(pages)

        for page in result:
            assert page.blocks[0].role == BlockRole.HEADER


# Positional Filter Tests
class TestPositionalFilter:
    def test_marks_top_zone_as_header(self):
        block = make_block("Some text", y0=5, y1=20)
        page = make_page(0, [block], height=800)
        
        filt = PositionalFilter(header_zone_pct=0.08)
        result = filt.apply([page])

        assert result[0].blocks[0].role == BlockRole.HEADER

    def test_marks_bottom_zone_as_footer(self):
        block = make_block("Some text", y0=760, y1=780)
        page = make_page(0, [block], height=800)

        filt = PositionalFilter(footer_zone_pct=0.08)
        result = filt.apply([page])

        assert result[0].blocks[0].role == BlockRole.FOOTER

    def test_body_zone_untouched(self):
        block = make_block("Body text", y0=400, y1=420)
        page = make_page(0, [block], height=800)

        filt = PositionalFilter()
        result = filt.apply([page])

        assert result[0].blocks[0].role == BlockRole.UNKNOWN


# Page Number Detector Tests
class TestPageNumberDetector:
    @pytest.mark.parametrize("text", [
        "42",
        "- 42 -",
        "Page 42",
        "3 of 120",
        "p. 42",
        "iv",
        "xii",
        "[42]",
    ])
    def test_detects_page_number_patterns(self, text):
        block = make_block(text, y0=770, y1=790)
        page = make_page(0, [block], height=800)

        detector = PageNumberDetector()
        result = detector.apply([page])

        assert result[0].blocks[0].role == BlockRole.PAGE_NUMBER

    def test_ignores_regular_numbers_in_body(self):
        """Numbers in the body zone should NOT be flagged as page numbers."""
        block = make_block("42", y0=400, y1=420)
        page = make_page(0, [block], height=800)

        detector = PageNumberDetector()
        result = detector.apply([page])

        assert result[0].blocks[0].role == BlockRole.UNKNOWN

    def test_ignores_long_text_with_numbers(self):
        block = make_block("The study included 42 participants.", y0=770, y1=790)
        page = make_page(0, [block], height=800)

        detector = PageNumberDetector()
        result = detector.apply([page])

        assert result[0].blocks[0].role != BlockRole.PAGE_NUMBER


# Heading Detector Tests
class TestHeadingDetector:
    def test_detects_large_font_as_title(self):
        blocks = [
            make_block("Introduction", font_size=24, is_bold=True),
            make_block("Regular body text here.", font_size=12),
            make_block("More body text here.", font_size=12),
            make_block("Even more body text.", font_size=12),
        ]
        page = make_page(0, blocks)

        detector = HeadingDetector()
        result = detector.apply([page])

        assert result[0].blocks[0].role == BlockRole.TITLE

    def test_detects_medium_bold_as_heading(self):
        blocks = [
            make_block("Section Header", font_size=18, is_bold=True),
            make_block("Body text one.", font_size=12),
            make_block("Body text two.", font_size=12),
            make_block("Body text three.", font_size=12),
        ]
        page = make_page(0, blocks)

        detector = HeadingDetector()
        result = detector.apply([page])

        assert result[0].blocks[0].role == BlockRole.HEADING


# Watermark Detector Tests
class TestWatermarkDetector:
    def test_detects_draft_watermark(self):
        block = make_block(
            "DRAFT",
            font_size=48,
            x0=50, x1=550,  # Wide span
            color=0,
        )
        page = make_page(0, [block], width=600)

        detector = WatermarkDetector()
        result = detector.apply([page])

        assert result[0].blocks[0].role == BlockRole.WATERMARK

    def test_detects_confidential_watermark(self):
        block = make_block(
            "CONFIDENTIAL",
            font_size=40,
            x0=50, x1=550,
            color=0,
        )
        page = make_page(0, [block], width=600)

        detector = WatermarkDetector()
        result = detector.apply([page])

        assert result[0].blocks[0].role == BlockRole.WATERMARK

    def test_ignores_normal_text(self):
        block = make_block("Regular body paragraph.", font_size=12)
        page = make_page(0, [block])

        detector = WatermarkDetector()
        result = detector.apply([page])

        assert result[0].blocks[0].role == BlockRole.UNKNOWN


# Reading Order Tests
class TestReadingOrder:
    def test_single_column_top_to_bottom(self):
        blocks = [
            make_block("Third", y0=300, y1=320),
            make_block("First", y0=100, y1=120),
            make_block("Second", y0=200, y1=220),
        ]

        sorter = ReadingOrderSorter()
        result = sorter.sort_page(blocks, 600)

        assert [b.text for b in result] == ["First", "Second", "Third"]

    def test_multi_column_detection(self):
        """Two columns: left column reads first, then right."""
        blocks = [
            make_block("Left 1", x0=50, x1=250, y0=100, y1=120),
            make_block("Right 1", x0=350, x1=550, y0=100, y1=120),
            make_block("Left 2", x0=50, x1=250, y0=200, y1=220),
            make_block("Right 2", x0=350, x1=550, y0=200, y1=220),
        ]

        sorter = ReadingOrderSorter()
        result = sorter.sort_page(blocks, 600)

        texts = [b.text for b in result]
        # Left column should come before right
        assert texts.index("Left 1") < texts.index("Right 1")
        assert texts.index("Left 2") < texts.index("Right 2")


# Text Assembly Tests
class TestTextAssembler:
    def test_heals_hyphenated_breaks(self):
        assembler = TextAssembler()
        result = assembler._post_process("knowl-\nedge is power")
        assert "knowledge" in result

    def test_collapses_blank_lines(self):
        assembler = TextAssembler()
        result = assembler._post_process("First\n\n\n\n\nSecond")
        assert "\n\n\n" not in result
        assert "First" in result
        assert "Second" in result

    def test_fixes_ligatures(self):
        assembler = TextAssembler()
        result = assembler._post_process("ﬁnancial ﬂow")
        assert "financial" in result
        assert "flow" in result
