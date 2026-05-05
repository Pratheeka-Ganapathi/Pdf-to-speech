"""API Routes - Segment-based TTS for progressive audio generation."""

from __future__ import annotations
import os, uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.schemas.api import (
    DocumentUploadResponse, DocumentResponse,
    ProcessingStatsResponse, TTSSegmentRequest, TTSInfoResponse,
    TTSSegmentResponse, SegmentInfo, VoiceOption,
)
from app.services.pdf.pipeline import PDFProcessingPipeline, BlockRole
from app.services.tts.service import TTSService, TTSConfig, VOICES, split_text_into_segments

router = APIRouter()

UPLOAD_DIR = Path("/tmp/pdf-to-speech/uploads")
AUDIO_DIR = Path("/tmp/pdf-to-speech/audio")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

_docs: dict[str, dict] = {}


# Upload & Process
@router.post("/documents/upload", response_model=DocumentUploadResponse, status_code=202)
async def upload_document(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files")

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(413, "Max 50MB")

    doc_id = str(uuid.uuid4())
    (UPLOAD_DIR / f"{doc_id}.pdf").write_bytes(content)

    pipeline = PDFProcessingPipeline()
    result = pipeline.process(str(UPLOAD_DIR / f"{doc_id}.pdf"))

    total_filtered = sum(len(p.filtered_blocks) for p in result.pages)
    total_body = sum(len(p.body_blocks) for p in result.pages)

    # Pre-split text into TTS segments
    segments_plan = split_text_into_segments(result.clean_text)

    _docs[doc_id] = {
        "id": doc_id,
        "title": result.title or file.filename.replace(".pdf", ""),
        "original_filename": file.filename,
        "status": "completed",
        "total_pages": result.total_pages,
        "word_count": result.word_count,
        "estimated_read_time": result.estimated_read_time_minutes,
        "chapters": [{"page": p, "title": f"Chapter at page {p+1}"} for p in result.chapter_breaks],
        "clean_text": result.clean_text,
        "filtered_blocks_count": total_filtered,
        "body_blocks_count": total_body,
        "filter_details": _count_filtered(result.pages),
        "has_audio": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        # Content structure
        "content_start_offset": result.content_start_offset,
        "chapters_with_offsets": result.chapters_with_offsets,
        # Segment plan
        "segments_plan": segments_plan,
        "segments_ready": {},
    }

    return DocumentUploadResponse(
        id=doc_id, title=_docs[doc_id]["title"], original_filename=file.filename,
        status="completed", total_pages=result.total_pages,
        word_count=result.word_count, estimated_read_time=result.estimated_read_time_minutes,
        filtered_blocks_count=total_filtered, body_blocks_count=total_body,
        message=f"Processed {result.total_pages} pages, {result.word_count} words. "
                f"Filtered {total_filtered} blocks. {len(segments_plan)} audio segments planned.",
    )


# Documents
@router.get("/documents")
async def list_documents():
    return {"documents": [_to_resp(d) for d in _docs.values()], "total": len(_docs)}

@router.get("/documents/{doc_id}", response_model=DocumentResponse)
async def get_document(doc_id: str):
    doc = _docs.get(doc_id)
    if not doc: raise HTTPException(404, "Not found")
    return _to_resp(doc)

@router.get("/documents/{doc_id}/text")
async def get_document_text(doc_id: str):
    doc = _docs.get(doc_id)
    if not doc: raise HTTPException(404, "Not found")
    return {
        "document_id": doc_id,
        "title": doc["title"],
        "clean_text": doc["clean_text"],
        "total_pages": doc["total_pages"],
        "word_count": doc["word_count"],
        "chapters": doc["chapters"],
        "content_start_offset": doc.get("content_start_offset", 0),
        "chapters_with_offsets": doc.get("chapters_with_offsets", []),
    }

@router.get("/documents/{doc_id}/stats", response_model=ProcessingStatsResponse)
async def get_stats(doc_id: str):
    doc = _docs.get(doc_id)
    if not doc: raise HTTPException(404, "Not found")
    d = doc.get("filter_details", {})
    return ProcessingStatsResponse(
        total_blocks_extracted=doc["filtered_blocks_count"]+doc["body_blocks_count"],
        body_blocks_kept=doc["body_blocks_count"],
        headers_removed=d.get("headers",0), footers_removed=d.get("footers",0),
        page_numbers_removed=d.get("page_numbers",0), watermarks_removed=d.get("watermarks",0))

@router.delete("/documents/{doc_id}", status_code=204)
async def delete_doc(doc_id: str):
    if doc_id not in _docs: raise HTTPException(404, "Not found")
    _docs.pop(doc_id)


# TTS Segments
@router.get("/documents/{doc_id}/tts/info", response_model=TTSInfoResponse)
async def tts_info(doc_id: str):
    """Returns segment plan with ready/not-ready status and estimated durations."""
    doc = _docs.get(doc_id)
    if not doc: raise HTTPException(404, "Not found")

    plan = doc["segments_plan"]
    ready = doc["segments_ready"]
    total_chars = len(doc["clean_text"])

    # Estimate: ~150ms per character at 1x speed (rough)
    est_total_dur = total_chars * 0.06  # ~60ms per char is a better estimate for speech

    segments = []
    for i, seg in enumerate(plan):
        idx_str = str(i)
        is_ready = idx_str in ready
        dur = ready[idx_str]["duration"] if is_ready else (seg["char_end"] - seg["char_start"]) * 0.06
        segments.append(SegmentInfo(
            index=i, ready=is_ready,
            duration_seconds=round(dur, 1),
            char_start=seg["char_start"],
            char_end=seg["char_end"],
        ))

    return TTSInfoResponse(
        document_id=doc_id,
        total_segments=len(plan),
        total_chars=total_chars,
        estimated_total_duration=round(est_total_dur, 1),
        segments=segments,
    )


@router.post("/documents/{doc_id}/tts/segment/{index}", response_model=TTSSegmentResponse)
async def generate_segment(doc_id: str, index: int, req: TTSSegmentRequest):
    """Generate audio for one segment. Returns immediately if already generated."""
    doc = _docs.get(doc_id)
    if not doc: raise HTTPException(404, "Not found")

    plan = doc["segments_plan"]
    if index < 0 or index >= len(plan):
        raise HTTPException(400, f"Segment {index} out of range (0-{len(plan)-1})")

    idx_str = str(index)
    ready = doc["segments_ready"]

    # Return cached if already generated with same voice
    if idx_str in ready and ready[idx_str].get("voice") == req.voice_id:
        r = ready[idx_str]
        return TTSSegmentResponse(
            document_id=doc_id, segment_index=index, status="ready",
            audio_url=f"/api/v1/documents/{doc_id}/tts/segment/{index}/audio",
            duration_seconds=r["duration"],
            synthesis_time=0,
            word_boundaries=r["boundaries"],
        )

    # Generate
    seg = plan[index]
    config = TTSConfig(voice=req.voice_id, speed=req.speed)
    tts = TTSService(config=config)
    audio_path = str(AUDIO_DIR / f"{doc_id}_seg{index}.mp3")

    try:
        result = await tts.synthesize_segment(seg["text"], audio_path, char_offset=seg["char_start"])
    except Exception as e:
        raise HTTPException(500, f"Synthesis failed: {e}")

    ready[idx_str] = {
        "duration": result.duration_seconds,
        "boundaries": result.word_boundaries,
        "audio_path": result.audio_path,
        "voice": req.voice_id,
    }
    doc["has_audio"] = True

    return TTSSegmentResponse(
        document_id=doc_id, segment_index=index, status="ready",
        audio_url=f"/api/v1/documents/{doc_id}/tts/segment/{index}/audio",
        duration_seconds=result.duration_seconds,
        synthesis_time=result.synthesis_time,
        word_boundaries=result.word_boundaries,
    )


@router.get("/documents/{doc_id}/tts/segment/{index}/audio")
async def get_segment_audio(doc_id: str, index: int):
    doc = _docs.get(doc_id)
    if not doc: raise HTTPException(404, "Not found")
    idx_str = str(index)
    if idx_str not in doc["segments_ready"]:
        raise HTTPException(404, f"Segment {index} not generated yet")
    path = doc["segments_ready"][idx_str]["audio_path"]
    if not os.path.exists(path):
        raise HTTPException(404, "Audio file missing")
    return FileResponse(path, media_type="audio/mpeg")


@router.get("/tts/voices")
async def list_voices():
    return {"voices": [VoiceOption(**v) for v in VOICES]}


# Helpers
def _to_resp(doc):
    return DocumentResponse(
        id=doc["id"], title=doc["title"], original_filename=doc["original_filename"],
        status=doc["status"], total_pages=doc["total_pages"], word_count=doc["word_count"],
        estimated_read_time=doc["estimated_read_time"], chapters=doc["chapters"],
        filtered_blocks_count=doc["filtered_blocks_count"], body_blocks_count=doc["body_blocks_count"],
        has_audio=doc.get("has_audio", False), created_at=doc.get("created_at", ""))

def _count_filtered(pages):
    c = {"headers":0,"footers":0,"page_numbers":0,"watermarks":0}
    for p in pages:
        for b in p.filtered_blocks:
            if b.role == BlockRole.HEADER: c["headers"]+=1
            elif b.role == BlockRole.FOOTER: c["footers"]+=1
            elif b.role == BlockRole.PAGE_NUMBER: c["page_numbers"]+=1
            elif b.role == BlockRole.WATERMARK: c["watermarks"]+=1
    return c
