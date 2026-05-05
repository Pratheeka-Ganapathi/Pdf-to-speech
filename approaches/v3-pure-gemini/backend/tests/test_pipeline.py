"""Tests for Gemini PDF service (Option D)."""

from app.services.pdf.gemini_service import (
    _extract_chapters, _strip_markers, _find_content_start,
    _format_layout, _parse_json,
)


class TestLayoutFormat:
    def test_formats_header_footer(self):
        layout = {"header": "ATOMIC HABITS", "footer": "James Clear", "page_num_pos": "bottom-center"}
        result = _format_layout(layout)
        assert "ATOMIC HABITS" in result
        assert "James Clear" in result
        assert "bottom-center" in result

    def test_empty_layout(self):
        assert _format_layout({}) == ""

    def test_no_header(self):
        result = _format_layout({"header": "", "footer": "Footer"})
        assert "Footer" in result
        assert "header" not in result.lower() or "REMOVE" not in result.split("Footer")[0]


class TestParseJson:
    def test_direct(self):
        assert _parse_json('{"header":"test"}')["header"] == "test"

    def test_fenced(self):
        assert _parse_json('```json\n{"a":1}\n```')["a"] == 1

    def test_garbage(self):
        assert _parse_json("not json") is None


class TestChapters:
    def test_extracts(self):
        text = "[TITLE]Intro[/TITLE]\nbody\n[HEADING]Sub[/HEADING]"
        chs = _extract_chapters(text)
        assert len(chs) == 2
        assert chs[0]["type"] == "title"
        assert chs[1]["type"] == "heading"

    def test_empty(self):
        assert _extract_chapters("no markers") == []


class TestStripMarkers:
    def test_strips(self):
        result = _strip_markers("[TITLE]Hello[/TITLE]")
        assert result == "Hello"
        assert "[" not in result


class TestContentStart:
    def test_uses_layout_hint(self):
        layout = {"content_start": "Introduction"}
        chapters = [{"title": "Introduction", "char_offset": 500, "type": "title"}]
        assert _find_content_start("x" * 1000, chapters, layout) == 500

    def test_finds_intro(self):
        chapters = [{"title": "Introduction", "char_offset": 300, "type": "title"}]
        assert _find_content_start("x" * 1000, chapters, {}) == 300

    def test_finds_ch1(self):
        chapters = [{"title": "1 Power", "char_offset": 200, "type": "title"}]
        assert _find_content_start("x" * 1000, chapters, {}) == 200

    def test_empty(self):
        assert _find_content_start("text", [], {}) == 0
