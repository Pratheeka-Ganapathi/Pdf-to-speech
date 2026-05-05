import { ENDPOINT_PATTERNS } from './constants.js';

/**
 * Try multiple endpoint paths until one succeeds
 */
export async function probeEndpoint(baseUrl, paths, options = {}) {
  const { method = "GET", timeout = 4000, body } = options;

  for (const path of paths) {
    try {
      const url = `${baseUrl}${path}`;
      const opts = { method, signal: AbortSignal.timeout(timeout) };

      if (body) {
        opts.body = body;
        if (!(body instanceof FormData)) {
          opts.headers = { "Content-Type": "application/json" };
        }
      }

      const res = await fetch(url, opts);
      if (res.ok) {
        return { path, data: await res.json() };
      }
    } catch (e) {
      // Try next path
    }
  }
  return null;
}

/**
 * Detect extraction backend from API response data
 */
const EXTRACTION_SIGNATURES = [
  ["pymupdf", "PyMuPDF (fitz)"], ["fitz", "PyMuPDF (fitz)"],
  ["marker", "Marker"], ["nougat", "Nougat"], ["doctr", "docTR"],
  ["unstructured", "Unstructured"], ["surya", "Surya"],
  ["tesseract", "Tesseract OCR"], ["paddle", "PaddleOCR"], ["ppocr", "PaddleOCR"],
  ["pdfplumber", "pdfplumber"], ["camelot", "Camelot"], ["tabula", "Tabula"],
  ["pdf reader", "PDF to Speech Pipeline"], ["tika", "Apache Tika"],
  ["textract", "AWS Textract"], ["azure", "Azure Document Intelligence"],
  ["google", "Google Document AI"],
];

/**
 * Detect TTS backend from voice list
 */
const TTS_SIGNATURES = [
  ["neural", "Edge-TTS (Neural)"], ["edge", "Edge-TTS"],
  ["openai", "OpenAI TTS"], ["elevenlabs", "ElevenLabs"], ["eleven", "ElevenLabs"],
  ["coqui", "Coqui TTS"], ["piper", "Piper TTS"],
  ["bark", "Bark"], ["xtts", "XTTS"], ["tortoise", "Tortoise TTS"],
  ["silero", "Silero TTS"], ["espeak", "eSpeak"],
];

/**
 * Connect to a server, discover endpoints, and detect model info
 */
export async function connectAndDiscover(baseUrl) {
  const base = baseUrl.replace(/\/+$/, "");
  const discovered = {};

  // 1. Health check
  const health = await probeEndpoint(base, ENDPOINT_PATTERNS.health);
  if (!health) {
    throw new Error(
      "No health endpoint found. Check the URL and ensure CORS allows this origin. " +
      "Add \"*\" to CORS_ORIGINS in your backend config."
    );
  }
  discovered.health = health.path;

  // 2. Build model info
  const model = {
    name: health.data?.title || health.data?.name || health.data?.app_name || "Unknown",
    version: health.data?.version || health.data?.app_version || "-",
    extractionBackend: "Unknown",
    ttsBackend: "Unknown",
    detectedAt: new Date().toISOString(),
    raw: health.data,
  };

  // 3. Try model/info endpoints
  const info = await probeEndpoint(base, ENDPOINT_PATTERNS.modelInfo);
  if (info?.data) {
    discovered.modelInfo = info.path;
    const d = info.data;
    if (d.model) model.name = d.model;
    if (d.name && model.name === "Unknown") model.name = d.name;
    if (d.extraction_backend || d.extractor || d.pipeline) {
      model.extractionBackend = d.extraction_backend || d.extractor || d.pipeline;
    }
    if (d.tts_backend || d.tts_engine) {
      model.ttsBackend = d.tts_backend || d.tts_engine;
    }
    model.raw = { ...model.raw, ...d };
  }

  // 4. Try voices endpoint to detect TTS engine
  const voices = await probeEndpoint(base, ENDPOINT_PATTERNS.voices);
  if (voices?.data) {
    discovered.voices = voices.path;
    const vlist = voices.data.voices || voices.data;
    if (Array.isArray(vlist) && vlist.length > 0) {
      const vid = (vlist[0].id || vlist[0].name || "").toLowerCase();
      let matched = false;
      for (const [sig, name] of TTS_SIGNATURES) {
        if (vid.includes(sig)) { model.ttsBackend = name; matched = true; break; }
      }
      if (!matched) model.ttsBackend = `Custom (${vlist.length} voices)`;
    }
  }

  // 5. Detect extraction backend from response strings
  if (model.extractionBackend === "Unknown") {
    const rawStr = JSON.stringify(model.raw).toLowerCase();
    for (const [sig, name] of EXTRACTION_SIGNATURES) {
      if (rawStr.includes(sig)) { model.extractionBackend = name; break; }
    }
  }

  // 6. Fallback name
  if (model.name === "Unknown") {
    try { model.name = `Server @ ${new URL(base).host}`; } catch (e) { model.name = base; }
  }

  return { model, discovered, base };
}
