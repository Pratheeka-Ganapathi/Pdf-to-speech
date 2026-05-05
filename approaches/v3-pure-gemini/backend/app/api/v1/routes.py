"""HTTP routes. Documents go in via POST /documents/upload, audio comes
out via POST /documents/{id}/tts/segment/{i}. State is in-memory; restart
the process and you lose your uploads."""

from __future__ import annotations
import os, uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.schemas.api import (
    DocumentUploadResponse, DocumentResponse,
    ProcessingStatsResponse, TTSSegmentRequest, TTSInfoResponse,
    TTSSegmentResponse, SegmentInfo, VoiceOption,
)
from app.services.pdf.gemini_service import extract_pdf_with_gemini
from app.services.tts.service import TTSService, TTSConfig, VOICES, split_text_into_segments

import structlog
logger = structlog.get_logger()

router = APIRouter()

UPLOAD_DIR = Path("/tmp/pdf-to-speech/uploads")
AUDIO_DIR = Path("/tmp/pdf-to-speech/audio")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

# In-memory document store. Fine for a single-instance dev/demo setup.
# For prod this would move to Postgres or similar.
_docs: dict[str, dict] = {}


@router.post("/documents/upload", response_model=DocumentUploadResponse, status_code=202)
async def upload_document(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(413, "Max 20MB (Gemini limit)")

    doc_id = str(uuid.uuid4())
    pdf_path = str(UPLOAD_DIR / f"{doc_id}.pdf")
    (UPLOAD_DIR / f"{doc_id}.pdf").write_bytes(content)

    settings = get_settings()
    if not settings.GEMINI_API_KEY:
        raise HTTPException(400, "GEMINI_API_KEY required. Set it in .env")

    logger.info("upload_start", doc_id=doc_id, filename=file.filename,
                size_mb=round(len(content) / 1024 / 1024, 1))

    # The whole pipeline lives in this one call: calibrate + extract.
    clean_text, chapters, content_start, total_pages = await extract_pdf_with_gemini(
        pdf_path, settings.GEMINI_API_KEY
    )

    if not clean_text.strip():
        raise HTTPException(500,
            "Gemini returned no text. Possible causes: rate limit (wait 60s), "
            "empty/scanned PDF, or API error. Check: docker compose logs api --tail 20")

    segments_plan = split_text_into_segments(clean_text)

    # Title falls back through: first chapter, first line of body, filename
    title = ""
    if chapters:
        title = chapters[0]["title"]
    if not title:
        first_line = clean_text.split("\n")[0].strip()[:80]
        title = first_line or file.filename.replace(".pdf", "")

    word_count = len(clean_text.split())

    _docs[doc_id] = {
        "id": doc_id,
        "title": title,
        "original_filename": file.filename,
        "status": "completed",
        "total_pages": total_pages,
        "word_count": word_count,
        "estimated_read_time": round(word_count / 200, 1),
        "chapters": [{"page": 0, "title": ch["title"]} for ch in chapters if ch["type"] == "title"],
        "clean_text": clean_text,
        "has_audio": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "content_start_offset": content_start,
        "chapters_with_offsets": chapters,
        "segments_plan": segments_plan,
        "segments_ready": {},
    }

    logger.info("upload_done", doc_id=doc_id, pages=total_pages,
                words=word_count, chapters=len(chapters), segments=len(segments_plan))

    return DocumentUploadResponse(
        id=doc_id, title=title, original_filename=file.filename,
        status="completed", total_pages=total_pages,
        word_count=word_count, estimated_read_time=round(word_count / 200, 1),
        filtered_blocks_count=0, body_blocks_count=0,
        message=f"Gemini processed {total_pages} pages, {word_count:,} words, "
                f"{len(chapters)} chapters, {len(segments_plan)} audio segments.",
    )


# Document CRUD
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
    return ProcessingStatsResponse(
        total_blocks_extracted=0, body_blocks_kept=0,
        headers_removed=0, footers_removed=0,
        page_numbers_removed=0, watermarks_removed=0)

@router.get("/documents/{doc_id}/profile")
async def get_profile(doc_id: str):
    doc = _docs.get(doc_id)
    if not doc: raise HTTPException(404, "Not found")
    return {"document_id": doc_id, "method": "gemini-direct-pdf",
            "chapters": len(doc.get("chapters_with_offsets", [])),
            "content_start": doc.get("content_start_offset", 0)}

@router.delete("/documents/{doc_id}", status_code=204)
async def delete_doc(doc_id: str):
    if doc_id not in _docs: raise HTTPException(404, "Not found")
    _docs.pop(doc_id)


# TTS endpoints
@router.get("/documents/{doc_id}/tts/info", response_model=TTSInfoResponse)
async def tts_info(doc_id: str):
    doc = _docs.get(doc_id)
    if not doc: raise HTTPException(404, "Not found")
    plan = doc["segments_plan"]
    ready = doc["segments_ready"]
    total_chars = len(doc["clean_text"])
    segments = []
    for i, seg in enumerate(plan):
        idx = str(i)
        is_ready = idx in ready
        dur = ready[idx]["duration"] if is_ready else (seg["char_end"] - seg["char_start"]) * 0.06
        segments.append(SegmentInfo(
            index=i, ready=is_ready, duration_seconds=round(dur, 1),
            char_start=seg["char_start"], char_end=seg["char_end"]))
    return TTSInfoResponse(
        document_id=doc_id, total_segments=len(plan),
        total_chars=total_chars,
        estimated_total_duration=round(total_chars * 0.06, 1),
        segments=segments)

@router.post("/documents/{doc_id}/tts/segment/{index}", response_model=TTSSegmentResponse)
async def generate_segment(doc_id: str, index: int, req: TTSSegmentRequest):
    doc = _docs.get(doc_id)
    if not doc: raise HTTPException(404, "Not found")
    plan = doc["segments_plan"]
    if index < 0 or index >= len(plan):
        raise HTTPException(400, f"Segment {index} out of range")
    idx = str(index)
    ready = doc["segments_ready"]
    if idx in ready and ready[idx].get("voice") == req.voice_id:
        r = ready[idx]
        return TTSSegmentResponse(
            document_id=doc_id, segment_index=index, status="ready",
            audio_url=f"/api/v1/documents/{doc_id}/tts/segment/{index}/audio",
            duration_seconds=r["duration"], synthesis_time=0,
            word_boundaries=r["boundaries"])
    seg = plan[index]
    config = TTSConfig(voice=req.voice_id, speed=req.speed)
    tts = TTSService(config=config)
    audio_path = str(AUDIO_DIR / f"{doc_id}_seg{index}.mp3")
    try:
        result = await tts.synthesize_segment(seg["text"], audio_path, char_offset=seg["char_start"])
    except Exception as e:
        logger.error("tts_error", error=str(e))
        raise HTTPException(500, f"TTS failed: {e}")
    ready[idx] = {
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
        word_boundaries=result.word_boundaries)

@router.get("/documents/{doc_id}/tts/segment/{index}/audio")
async def get_segment_audio(doc_id: str, index: int):
    doc = _docs.get(doc_id)
    if not doc: raise HTTPException(404, "Not found")
    idx = str(index)
    if idx not in doc["segments_ready"]:
        raise HTTPException(404, f"Segment {index} not generated")
    path = doc["segments_ready"][idx]["audio_path"]
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
        estimated_read_time=doc["estimated_read_time"],
        chapters=doc["chapters"],
        filtered_blocks_count=0, body_blocks_count=0,
        has_audio=doc.get("has_audio", False), created_at=doc.get("created_at", ""))
