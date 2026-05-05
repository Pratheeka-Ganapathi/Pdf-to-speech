# Benchmark dashboard

A static React/Vite app that evaluates a PDF-to-speech backend over its REST endpoints. I built this to compare different versions of the reader while iterating, but it's generic enough to point at any backend that exposes the same endpoints.

## What it measures

Seven metrics across three stages.

**Stage 1, extraction (PDF -> text):**
- Layout F1, harmonic mean of precision and recall over structural elements, body content, noise filtering, and reading order.
- WER, Levenshtein edit distance at the word level vs a reference text.
- Latency, browser timer from upload start to extracted-text response.

**Stage 2, TTS (text -> speech):**
- MOS (proxy), automated estimate of speech quality on a 1-5 scale. Uses word boundary timing analysis when the engine returns boundaries; falls back to a Speed+RTF estimator when it doesn't.
- RTF, synthesis_time / audio_duration. Below 0.2 is good.
- WSD, fraction of heteronym contexts that survived extraction (read, tear, lead, wind, bow, etc).

**Stage 3, system:**
- System Health, harmonic mean of (1 - WER), MOS/5, and a success indicator from F1.

The full math is in [`docs/benchmark-metrics.pdf`](../docs/benchmark-metrics.pdf).

## Run it

```bash
npm install
npm run dev
```

Opens at http://localhost:5555.

## How a run works

1. Type your backend URL into the Server box and click Connect. The dashboard probes a list of well-known endpoint paths to figure out which API style your backend uses.
2. Click "Run Benchmark" to use the embedded reference PDF (a known short document with hardcoded headings, body phrases, and noise patterns), or "Test Your PDF" to upload your own and paste a few pages of reference text.
3. Results land in the Dashboard tab with a system health score, a radar chart, and per-metric cards. The History tab is a table of every run; you can add notes per row and export the lot to Excel.

Runs are saved to localStorage, so they survive a page refresh but not a clear-cookies.

## What backend it expects

Your backend needs to expose:

- `GET /health` (or `/api/v1/health`) returning JSON.
- `POST /api/v1/documents/upload` accepting multipart PDF, returning a JSON body with an `id` field.
- `GET /api/v1/documents/{id}/text` returning a JSON body with a `clean_text` (or `text`) field.
- Optional but recommended: `GET /api/v1/documents/{id}/tts/info`, `POST /api/v1/documents/{id}/tts/segment/0`, and `GET /api/v1/tts/voices` for the TTS metrics to work.

CORS needs to allow the dashboard's origin. For local dev, setting `CORS_ORIGINS=["*"]` is fine.

## Auto-detection

When you connect, the dashboard probes a few model-info endpoints (`/api/v1/model`, `/api/v1/info`, `/info`, `/config`) and tries to identify what's running. It recognizes PyMuPDF, Marker, Nougat, docTR, Surya, Unstructured, Tesseract, PaddleOCR, and pdfplumber for extraction; Edge-TTS, OpenAI, ElevenLabs, Coqui, Piper, Bark, and XTTS for TTS. If it doesn't match any of those it just shows "Unknown" and you can fill in the model name yourself.

## Build for static hosting

```bash
npm run build
```

The `dist/` folder is fully static, drop it on Nginx, Vercel, Netlify, S3, anywhere.

There's also a Dockerfile if you'd rather run it in a container:

```bash
docker build -t pdf-benchmark .
docker run -p 5555:80 pdf-benchmark
```

## Layout

```
src/
├── main.jsx        entry point
├── App.jsx         dashboard UI (everything)
├── constants.js    reference text, patterns, embedded test PDF
├── metrics.js      F1, WER, RTF, MOS, WSD, harmonic mean
└── discovery.js    endpoint probing and backend detection
```
