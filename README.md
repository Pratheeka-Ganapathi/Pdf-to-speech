# PDF to Speech

Turn a book PDF into spoken audio. Three different architectures, all included in this repo, plus the benchmark dashboard I built to compare them.

## What it does

You upload a PDF, the backend strips out the headers, footers, page numbers, and watermarks that a TTS engine would otherwise read out loud, and Kokoro reads what's left. The system targets non-fiction and self-help books.

## Three approaches

I went through three fairly different architectures while building this. All three are in `approaches/`, each runnable on its own.

**v1, PyMuPDF only.** Pure heuristics. PyMuPDF extracts text, then 8 stages of font-size analysis, regex matching, and positional filtering try to drop noise. Fast (25 to 500 ms per book) and free. Works on simple PDFs but couldn't reliably filter book-specific running headers, so I needed something smarter.

**v2, PyMuPDF + Gemini calibrator.** Same PyMuPDF pipeline, but Gemini analyzes 6-8 sample pages first and hands the heuristic stages a per-document layout profile (where headers sit, what font sizes to expect, etc). This is what stabilized things. F1 went from "depends on the book" to consistently 1.0. The DELETE-instruction prompt trick lives here too: ask Gemini for the line numbers to drop instead of full cleaned text, and output tokens drop about 78%.

**v3, pure Gemini.** Render 4 sample pages, ask Gemini what the layout looks like, then send the whole PDF to Gemini with that context and let it return clean text directly. Same accuracy as v2 with a third of the code. Latency is worse (~30 seconds vs sub-second for v1), but the simplicity won out and this is what's in production.

## Benchmark results

17 runs against the same evaluation harness while iterating. Production (RUN-0034) hits F1 = 1.00, System Health = 81.2%, around $0.015 per 256-page book.

The dashboard in [`benchmark/`](benchmark/) is what computed all of these. Approach codes: **A** = PyMuPDF only, **B** = PyMuPDF + Gemini post-processor with no calibration, **C** = Gemini calibration with PyMuPDF + Edge-TTS, **D** = same with Kokoro, **E** = pure Gemini, **F** = pdf2image + Gemini (the production version).

| Run | Approach | Version | Pre-Analysis | Post-Analysis | TTS | F1 | WER | Latency | Health | Noise | What changed |
| --- | :---: | :---: | --- | --- | :---: | ---: | ---: | ---: | ---: | :---: | --- |
| RUN-0001 | A | v1 | - | PyMuPDF | Edge | 1.00 | 0.0% | 25 ms | 1.00 | 5/5 | Baseline on the synthetic benchmark PDF |
| RUN-0002 | A | v1 | - | PyMuPDF | Edge | 0.84 | 2.9% | 463 ms | 0.74 | 0/4 | First real book, noise leaked through |
| RUN-0003 | A | v1 | - | PyMuPDF | Edge | 0.84 | 2.9% | 478 ms | 0.85 | 0/4 | Same pattern on a second book |
| RUN-0004 | B | v2 | PyMuPDF | Gemini | Edge | 0.87 | 18.5% | 559 ms | 0.80 | 0/4 | Gemini post-processor added |
| RUN-0005 | B | v2 | PyMuPDF | Gemini | Edge | 0.87 | 18.5% | 448 ms | 0.80 | 0/4 | Repeated, same numbers |
| RUN-0006 | B | v2 | PyMuPDF | Gemini | Edge | 1.00 | 0.0% | 10408 ms | 0.72 | 5/5 | First trial with layout calibration |
| RUN-0007 | C | v2 | Gemini | PyMuPDF | Edge | 1.00 | 0.0% | 23814 ms | 0.85 | 5/5 | Calibration moved upstream, F1 stays at 1.00 |
| RUN-0008 | C | v2 | Gemini | PyMuPDF | Edge | 1.00 | 15.1% | 25803 ms | 0.81 | 0/4 | Tracked the WER plateau to text normalization |
| RUN-0009 | D | v2 | Gemini | PyMuPDF | Kokoro | 1.00 | 15.1% | 25752 ms | 0.81 | 0/4 | Switched from Edge-TTS to Kokoro |
| RUN-0010 | D | v2 | Gemini | PyMuPDF | Kokoro | 1.00 | 18.4% | 27189 ms | 0.80 | 0/4 | Kokoro reproduced |
| RUN-0012 | E | v3 | Gemini | - | Kokoro | 1.00 | 15.1% | 23187 ms | 0.81 | 0/4 | Dropped PyMuPDF entirely |
| **RUN-0013** | **F** | **v3** | **pdf2image** | **Gemini** | **Kokoro** | **1.00** | **15.1%** | **32730 ms** | **0.81** | **0/4** | **production** |

A few things worth knowing about these numbers.

The benchmark PDF is synthetic and pretty simple, so RUN-0005 hitting 1.00 on it doesn't say much. The honest signal is what happens on real books: RUN-0004 and RUN-0006 (heuristics fail to filter noise) and everything from RUN-0010 onward.

The 15.1% WER plateau in C through F isn't extraction error. Gemini lightly normalizes text, expanding "Dr." to "Doctor", smoothing whitespace, that kind of thing. The benchmark's word-level edit distance counts those as errors even though the meaning is identical. The actual content survives intact.

v3 ships not because it's more accurate (it isn't, the numbers are the same as v2's calibrated runs) but because it's a third of the code. v2 needs a 1,200-line pipeline (TOC parser, font detector, repetition filter, positional filter) to make sense of PyMuPDF's spatial output. v3 throws all that away and asks Gemini to do it.

Full engineering writeup is in [`docs/technical-report.docx`](docs/technical-report.docx). The 7 metrics and how they're computed are in [`docs/benchmark-metrics.docx`](docs/benchmark-metrics.docx).

## Layout

```
pdf-to-speech/
├── README.md
├── LICENSE
├── .gitignore
├── .env.example
├── docs/
│   ├── technical-report.docx
│   └── benchmark-metrics.docx
├── approaches/
│   ├── v1-pymupdf-only/
│   ├── v2-pymupdf-gemini/
│   └── v3-pure-gemini/
└── benchmark/
```

Each approach has its own README with specifics, dependencies, and how to run it.

## Quick start (v3)

You'll need Docker and a free Gemini API key from https://aistudio.google.com/app/apikey.

```bash
cd approaches/v3-pure-gemini
cp ../../.env.example .env
# edit .env, set GEMINI_API_KEY=AIza...
docker compose up -d --build
```

Frontend at http://localhost:3000, API docs at http://localhost:8000/docs.

For v1 or v2, see their READMEs.

## Benchmark dashboard

The `benchmark/` folder is a standalone Vite app that hits any backend exposing the standard endpoints and computes seven metrics across three stages (extraction, TTS, system health). I used it for every run on the table above.

```bash
cd benchmark
npm install
npm run dev
```

Opens at http://localhost:5555.

## Stack

Backend: FastAPI, PyMuPDF (v1, v2), pdf2image (v3), Gemini 2.5 Flash (v2, v3), Kokoro-82M (v2, v3), Edge-TTS (v1, v2), ffmpeg, NumPy, soundfile.

Frontend: React 18, Vite, TypeScript, TanStack Query, Zustand, Tailwind, Lucide.

Benchmark dashboard: React, Vite, Recharts, SheetJS.

Deployment: Docker Compose, optional NVIDIA GPU passthrough for Kokoro.

## Author

Pratheeka Ganapathi, March-April 2026.

## License

[MIT](LICENSE).
