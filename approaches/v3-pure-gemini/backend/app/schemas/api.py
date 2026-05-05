"""API schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field


class DocumentUploadResponse(BaseModel):
    id: str; title: str; original_filename: str; status: str
    total_pages: int; word_count: int; estimated_read_time: float
    filtered_blocks_count: int; body_blocks_count: int; message: str

class DocumentResponse(BaseModel):
    id: str; title: str; original_filename: str; status: str
    total_pages: int; word_count: int; estimated_read_time: float
    chapters: list[dict]; filtered_blocks_count: int; body_blocks_count: int
    has_audio: bool; created_at: str

class DocumentTextResponse(BaseModel):
    document_id: str; title: str; clean_text: str
    total_pages: int; word_count: int; chapters: list[dict]

class ProcessingStatsResponse(BaseModel):
    total_blocks_extracted: int; body_blocks_kept: int
    headers_removed: int; footers_removed: int
    page_numbers_removed: int; watermarks_removed: int

class TTSSegmentRequest(BaseModel):
    voice_id: str = "af_heart"
    speed: float = Field(default=1.0, ge=0.5, le=2.0)

class SegmentInfo(BaseModel):
    index: int
    ready: bool
    duration_seconds: float = 0
    char_start: int
    char_end: int

class TTSInfoResponse(BaseModel):
    document_id: str
    total_segments: int
    total_chars: int
    estimated_total_duration: float  # seconds
    segments: list[SegmentInfo]

class TTSSegmentResponse(BaseModel):
    document_id: str; segment_index: int; status: str
    audio_url: str; duration_seconds: float
    synthesis_time: float
    word_boundaries: list[dict]

class VoiceOption(BaseModel):
    id: str; name: str; lang: str; gender: str; style: str
