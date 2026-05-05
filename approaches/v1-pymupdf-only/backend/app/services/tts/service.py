"""TTS service.

Splits the cleaned text into ~12k-char chunks and synthesizes each one
independently. The frontend starts playing chunk 0 as soon as it's
ready, and a background loop fills in the rest. Seeking to a chunk
that hasn't been generated yet triggers on-demand synthesis.
"""

from __future__ import annotations

import asyncio
import io
import os
import re
import time
from dataclasses import dataclass, field
from typing import Optional

import structlog

logger = structlog.get_logger()

SEGMENT_CHARS = 12000  # ~3000 words, ~3 min audio


@dataclass
class TTSConfig:
    voice: str = "en-US-AriaNeural"
    speed: float = 1.0
    pitch: str = "+0Hz"
    volume: str = "+0%"


@dataclass
class SegmentResult:
    index: int
    audio_path: str
    duration_seconds: float
    char_start: int
    char_end: int
    word_boundaries: list[dict] = field(default_factory=list)
    synthesis_time: float = 0.0


VOICES = [
    {"id": "en-US-AriaNeural", "name": "Aria", "lang": "en-US", "gender": "Female", "style": "Conversational"},
    {"id": "en-US-GuyNeural", "name": "Guy", "lang": "en-US", "gender": "Male", "style": "Professional"},
    {"id": "en-US-JennyNeural", "name": "Jenny", "lang": "en-US", "gender": "Female", "style": "Warm"},
    {"id": "en-GB-SoniaNeural", "name": "Sonia", "lang": "en-GB", "gender": "Female", "style": "British"},
    {"id": "en-GB-RyanNeural", "name": "Ryan", "lang": "en-GB", "gender": "Male", "style": "British"},
    {"id": "en-AU-NatashaNeural", "name": "Natasha", "lang": "en-AU", "gender": "Female", "style": "Australian"},
    {"id": "en-IN-NeerjaNeural", "name": "Neerja", "lang": "en-IN", "gender": "Female", "style": "Indian English"},
]


def split_text_into_segments(text: str) -> list[dict]:
    """Split text at paragraph boundaries into ~12k char segments."""
    paragraphs = text.split("\n\n")
    segments = []
    current = ""
    char_pos = 0

    for para in paragraphs:
        if not para.strip():
            char_pos += len(para) + 2
            continue

        if len(current) + len(para) + 2 > SEGMENT_CHARS and current:
            start = char_pos - len(current)
            segments.append({"text": current.strip(), "char_start": start, "char_end": char_pos})
            current = para
            char_pos += len(para) + 2
        else:
            current += "\n\n" + para if current else para
            char_pos += len(para) + 2

    if current.strip():
        start = char_pos - len(current)
        segments.append({"text": current.strip(), "char_start": start, "char_end": char_pos})

    return segments


class TTSService:
    MAX_CONCURRENT = 5
    CHUNK_SIZE = 3000  # Within a segment, split into TTS API chunks

    def __init__(self, config: Optional[TTSConfig] = None):
        self.config = config or TTSConfig()

    async def synthesize_segment(self, text: str, output_path: str, char_offset: int = 0) -> SegmentResult:
        """Synthesize one segment with parallel internal chunking."""
        chunks = self._split_for_tts(text)
        total = len(chunks)
        start = time.time()

        sem = asyncio.Semaphore(self.MAX_CONCURRENT)

        async def _do(idx, txt):
            async with sem:
                return await self._synth_chunk(idx, txt)

        raw = await asyncio.gather(*[_do(i, c) for i, c in enumerate(chunks)], return_exceptions=True)

        # Collect results in order
        parts = []
        for r in raw:
            if isinstance(r, Exception):
                logger.error("seg_chunk_err", error=str(r))
            elif r["audio"]:
                parts.append(r)

        parts.sort(key=lambda x: x["index"])

        # Combine + adjust boundaries
        combined = b""
        boundaries = []
        cum_ms = 0.0
        cum_chars = 0

        for p in parts:
            for wb in p["boundaries"]:
                boundaries.append({
                    "offset": char_offset + cum_chars + wb["offset"],
                    "text": wb["text"],
                    "time_ms": cum_ms + wb["audio_ms"],
                })
            cum_ms += p["duration_ms"]
            cum_chars += len(chunks[p["index"]]) + 2
            combined += p["audio"]

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(combined)

        elapsed = round(time.time() - start, 1)
        dur = cum_ms / 1000.0

        logger.info("segment_done", duration=round(dur, 1), seconds=elapsed, chunks=total)

        return SegmentResult(
            index=0, audio_path=output_path,
            duration_seconds=round(dur, 1),
            char_start=char_offset,
            char_end=char_offset + len(text),
            word_boundaries=boundaries,
            synthesis_time=elapsed,
        )

    async def _synth_chunk(self, idx: int, text: str) -> dict:
        import edge_tts

        # Strip markers - TTS gets clean text only
        clean = self._clean_for_tts(text)

        try:
            comm = edge_tts.Communicate(
                text=clean,
                voice=self.config.voice,
                rate=self._speed_pct(self.config.speed),
                pitch=self.config.pitch,
                volume=self.config.volume,
            )
            buf = io.BytesIO()
            boundaries = []
            last_ms = 0.0
            cursor = 0

            async for msg in comm.stream():
                if msg["type"] == "audio":
                    buf.write(msg["data"])
                elif msg["type"] == "WordBoundary":
                    ms = msg["offset"] / 10000
                    word = msg.get("text", "")
                    dur_ticks = msg.get("duration", 5000000)

                    # Search in ORIGINAL text (with markers) for correct offsets
                    found = text.find(word, cursor)
                    if found == -1:
                        found = text.lower().find(word.lower(), cursor)
                    offset = found if found >= 0 else cursor

                    boundaries.append({"offset": offset, "text": word, "audio_ms": ms})
                    if found >= 0:
                        cursor = found + len(word)
                    last_ms = max(last_ms, ms + dur_ticks / 10000)

            audio = buf.getvalue()
            dur_ms = last_ms if last_ms > 0 else len(audio) / 16000 * 1000

            return {"index": idx, "audio": audio, "boundaries": boundaries, "duration_ms": dur_ms}
        except Exception as e:
            logger.error("chunk_err", idx=idx, err=str(e))
            return {"index": idx, "audio": b"", "boundaries": [], "duration_ms": 0}

    @staticmethod
    def _clean_for_tts(text: str) -> str:
        """Minimal cleanup for TTS - text is already marker-free."""
        t = text.replace('\n', ' ')  # Flatten to single line
        t = re.sub(r'\s{2,}', ' ', t)  # Collapse spaces
        return t.strip()

    def _split_for_tts(self, text: str) -> list[str]:
        paras = [p.strip() for p in text.split("\n\n") if p.strip()]
        if not paras:
            return [text] if text.strip() else []
        chunks, cur = [], ""
        for p in paras:
            if len(cur) + len(p) + 2 > self.CHUNK_SIZE:
                if cur: chunks.append(cur.strip())
                if len(p) > self.CHUNK_SIZE:
                    for s in re.split(r'(?<=[.!?])\s+', p):
                        if len(cur) + len(s) + 1 > self.CHUNK_SIZE:
                            if cur: chunks.append(cur.strip())
                            cur = s
                        else:
                            cur += " " + s if cur else s
                else:
                    cur = p
            else:
                cur += "\n\n" + p if cur else p
        if cur.strip():
            chunks.append(cur.strip())
        return chunks

    @staticmethod
    def _speed_pct(speed: float) -> str:
        p = int((speed - 1.0) * 100)
        return f"+{p}%" if p >= 0 else f"{p}%"
