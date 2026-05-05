"""
Tests for the Gemini-Calibrated PDF Processing Pipeline.
All filters now accept a LayoutProfile for calibration.
"""

import pytest
from app.services.pdf.pipeline import (
    TextBlock, PageLayout, BlockRole, TOCEntry,
    PatternFilter, RepetitionFilter, PositionalFilter,
    PageNumberDetector, TOCHeadingDetector, WatermarkDetector,
    ReadingOrderSorter, TextAssembler,
)
from app.services.pdf.gemini_calibrator import LayoutProfile


# Helpers
def make_block(
    text: str, page: int = 0, y0: float = 100, y1: float = 120,
    x0: float = 50, x1: float = 300, font_size: float = 12,
    is_bold: bool = False, color: int = 0, role: BlockRole = BlockRole.UNKNOWN,
) -> TextBlock:
    return TextBlock(
        text=text, page_num=page, x0=x0, y0=y0, x1=x1, y1=y1,
        font_size=font_size, is_bold=is_bold, color=color, role=role,
    )

def make_page(page_num: int, blocks: list[TextBlock], height: float = 800, width: float = 600) -> PageLayout:
    return PageLayout(page_num=page_num, width=width, height=height, blocks=blocks)

def default_profile(**overrides) -> LayoutProfile:
    return LayoutProfile(**overrides)


# Pattern Filter (Gemini) Tests
class TestPatternFilter:
    def test_matches_gemini_header(self):
        profile = default_profile(header_texts=["Company Inc."])
        filt = PatternFilter(profile)
        page = make_page(0, [
            make_block("Company Inc.", y0=10, y1=25),
            make_block("Body text.", y0=200, y1=220),
        ])
        result = filt.apply([page])
        assert result[0].blocks[0].role == BlockRole.HEADER
        assert result[0].blocks[0].confidence == 0.95

    def test_matches_gemini_footer(self):
        profile = default_profile(footer_texts=["www.company.com"])
        filt = PatternFilter(profile)
        page = make_page(0, [make_block("www.company.com", y0=770, y1=790)])
        result = filt.apply([page])
        assert result[0].blocks[0].role == BlockRole.FOOTER

    def test_no_patterns_leaves_unknown(self):
        profile = default_profile()
        filt = PatternFilter(profile)
        page = make_page(0, [make_block("Random text", y0=200, y1=220)])
        result = filt.apply([page])
        assert result[0].blocks[0].role == BlockRole.UNKNOWN


# Repetition Filter Tests
class TestRepetitionFilter:
    def test_detects_repeated_header(self):
        pages = []
        for i in range(10):
            pages.append(make_page(i, [
                make_block("Company Name Inc.", page=i, y0=10, y1=25),
                make_block("Body text.", page=i, y0=200, y1=220),
            ]))
        filt = RepetitionFilter(threshold=0.5)
        result = filt.apply(pages)
        for page in result:
            assert page.blocks[0].role == BlockRole.HEADER

    def test_ignores_unique_text(self):
        pages = [make_page(i, [make_block(f"Unique {i}.", page=i, y0=200, y1=220)]) for i in range(5)]
        filt = RepetitionFilter(threshold=0.5)
        result = filt.apply(pages)
        for page in result:
            assert page.blocks[0].role == BlockRole.UNKNOWN


# Positional Filter Tests (Gemini-calibrated zones)
class TestPositionalFilter:
    def test_marks_top_zone_as_header(self):
        profile = default_profile(header_zone_pct=0.08)
        filt = PositionalFilter(profile)
        page = make_page(0, [make_block("Some text", y0=5, y1=20)], height=800)
        result = filt.apply([page])
        assert result[0].blocks[0].role == BlockRole.HEADER

    def test_marks_bottom_zone_as_footer(self):
        profile = default_profile(footer_zone_pct=0.08)
        filt = PositionalFilter(profile)
        page = make_page(0, [make_block("Some text", y0=760, y1=780)], height=800)
        result = filt.apply([page])
        assert result[0].blocks[0].role == BlockRole.FOOTER

    def test_custom_zones_from_gemini(self):
        """Gemini says header zone is 15% - should catch blocks deeper."""
        profile = default_profile(header_zone_pct=0.15)
        filt = PositionalFilter(profile)
        page = make_page(0, [make_block("Text at 10%", y0=75, y1=95)], height=800)
        result = filt.apply([page])
        assert result[0].blocks[0].role == BlockRole.HEADER

    def test_body_zone_untouched(self):
        profile = default_profile()
        filt = PositionalFilter(profile)
        page = make_page(0, [make_block("Body text", y0=400, y1=420)], height=800)
        result = filt.apply([page])
        assert result[0].blocks[0].role == BlockRole.UNKNOWN


# Page Number Detector Tests
class TestPageNumberDetector:
    @pytest.mark.parametrize("text", ["42", "- 42 -", "Page 42", "3 of 120", "p. 42", "iv", "xii", "[42]"])
    def test_detects_page_number_patterns(self, text):
        page = make_page(0, [make_block(text, y0=770, y1=790)], height=800)
        detector = PageNumberDetector()
        result = detector.apply([page])
        assert result[0].blocks[0].role == BlockRole.PAGE_NUMBER

    def test_ignores_numbers_in_body(self):
        page = make_page(0, [make_block("42", y0=400, y1=420)], height=800)
        detector = PageNumberDetector()
        result = detector.apply([page])
        assert result[0].blocks[0].role == BlockRole.UNKNOWN


# TOC Heading Detector Tests (TOC-first, font fallback)
class TestTOCHeadingDetector:
    def test_matches_toc_entry_exactly(self):
        """Block text matching a TOC entry should become TITLE."""
        toc = [TOCEntry(title="The Surprising Power of Atomic Habits", level=1, page=10)]
        profile = default_profile()
        detector = TOCHeadingDetector(toc, profile)
        page = make_page(0, [make_block("The Surprising Power of Atomic Habits", font_size=12)])
        result = detector.apply([page])
        assert result[0].blocks[0].role == BlockRole.TITLE

    def test_no_match_stays_unknown(self):
        """Body text NOT in TOC should stay UNKNOWN."""
        toc = [TOCEntry(title="Chapter 1", level=1, page=5)]
        profile = default_profile()
        detector = TOCHeadingDetector(toc, profile)
        page = make_page(0, [make_block("This is regular body text that is quite long.", font_size=12)])
        result = detector.apply([page])
        assert result[0].blocks[0].role == BlockRole.UNKNOWN

    def test_structure_word_always_heading(self):
        """'Introduction' should be heading even without TOC match."""
        toc = []
        profile = default_profile()
        detector = TOCHeadingDetector(toc, profile)
        page = make_page(0, [make_block("Introduction", font_size=12)])
        result = detector.apply([page])
        assert result[0].blocks[0].role == BlockRole.HEADING

    def test_fallback_font_when_no_toc(self):
        """Without TOC, large font should still detect titles."""
        toc = []  # No TOC
        profile = default_profile(title_font_size_min=20)
        detector = TOCHeadingDetector(toc, profile)
        page = make_page(0, [make_block("Big Title", font_size=24, is_bold=True)])
        result = detector.apply([page])
        assert result[0].blocks[0].role == BlockRole.TITLE

    def test_body_not_detected_with_toc(self):
        """With TOC present, body text with big font should NOT become title."""
        toc = [TOCEntry(title="Real Chapter", level=1, page=5)]
        profile = default_profile()
        detector = TOCHeadingDetector(toc, profile)
        page = make_page(0, [make_block("A regular sentence.", font_size=20, is_bold=True)])
        result = detector.apply([page])
        assert result[0].blocks[0].role == BlockRole.UNKNOWN


# Watermark Detector Tests (Gemini-calibrated)
class TestWatermarkDetector:
    def test_gemini_identified_watermark(self):
        profile = default_profile(watermark_text="REVIEW COPY")
        detector = WatermarkDetector(profile)
        page = make_page(0, [make_block("REVIEW COPY", font_size=48, x0=50, x1=550)], width=600)
        result = detector.apply([page])
        assert result[0].blocks[0].role == BlockRole.WATERMARK
        assert result[0].blocks[0].confidence == 0.95

    def test_default_watermark_keywords(self):
        profile = default_profile()
        detector = WatermarkDetector(profile)
        page = make_page(0, [make_block("DRAFT", font_size=48, x0=50, x1=550)], width=600)
        result = detector.apply([page])
        assert result[0].blocks[0].role == BlockRole.WATERMARK

    def test_ignores_normal_text(self):
        profile = default_profile()
        detector = WatermarkDetector(profile)
        page = make_page(0, [make_block("Regular text.", font_size=12)])
        result = detector.apply([page])
        assert result[0].blocks[0].role == BlockRole.UNKNOWN


# Reading Order Tests (Gemini-calibrated columns)
class TestReadingOrder:
    def test_single_column(self):
        profile = default_profile(has_columns=1)
        sorter = ReadingOrderSorter(profile)
        blocks = [
            make_block("Third", y0=300, y1=320),
            make_block("First", y0=100, y1=120),
            make_block("Second", y0=200, y1=220),
        ]
        result = sorter.sort_page(blocks, 600)
        assert [b.text for b in result] == ["First", "Second", "Third"]

    def test_multi_column_from_gemini(self):
        """Gemini says 2 columns - left reads before right."""
        profile = default_profile(has_columns=2)
        sorter = ReadingOrderSorter(profile)
        blocks = [
            make_block("Left 1", x0=50, x1=250, y0=100, y1=120),
            make_block("Right 1", x0=350, x1=550, y0=100, y1=120),
            make_block("Left 2", x0=50, x1=250, y0=200, y1=220),
            make_block("Right 2", x0=350, x1=550, y0=200, y1=220),
        ]
        result = sorter.sort_page(blocks, 600)
        texts = [b.text for b in result]
        assert texts.index("Left 1") < texts.index("Right 1")
        assert texts.index("Left 2") < texts.index("Right 2")


# Text Assembly Tests
class TestTextAssembler:
    def test_merges_consecutive_titles(self):
        assembler = TextAssembler()
        pages = [make_page(0, [
            make_block("THE", role=BlockRole.TITLE),
            make_block("MAN WHO DIDNT LOOK RIGHT", role=BlockRole.TITLE),
            make_block("Body text here.", role=BlockRole.BODY),
        ])]
        pages[0].body_blocks = pages[0].blocks
        text, chapters, _ = assembler.assemble(pages)
        assert "THE MAN WHO DIDNT LOOK RIGHT" in text
        # Should be ONE chapter, not two
        titles = [ch for ch in chapters if ch["type"] == "title"]
        assert len(titles) == 1

    def test_cleans_whitespace(self):
        assembler = TextAssembler()
        result = assembler._clean("First\n\n\n\n\nSecond")
        assert "\n\n\n" not in result
        assert "First" in result
        assert "Second" in result

    def test_single_newlines_become_spaces(self):
        assembler = TextAssembler()
        result = assembler._clean("line one\nline two\n\nparagraph two")
        assert "line one line two" in result
        assert "paragraph two" in result

    def test_strip_markers(self):
        result = TextAssembler._strip_markers("[TITLE]Hello World[/TITLE]")
        assert result.strip() == "Hello World"
        assert "[" not in result
