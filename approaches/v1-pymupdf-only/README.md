# v1: PyMuPDF only

The starting point. Pure heuristics, no API calls, $0 per book. It works on simple PDFs. It does not work on real books, which is why this got replaced.

## What it does

PyMuPDF reads the PDF and gives me text blocks with bounding boxes. From there it's 8 stages of regex matching, font-size analysis, and positional filtering to figure out what's body text and what's noise.

```
PDF -> fitz.open() -> text blocks with bbox + font

  1. Spatial extraction       text blocks with bounding boxes
  2. Repetition filter        text repeating across pages = running header
  3. Positional filter        top/bottom 8% of the page is suspect
  4. Page number detector     7 regex patterns
  5. Heading detector         font-size outliers
  6. Watermark detector       big light text spanning the page
  7. Reading order            column-aware sort
  8. Text assembly            paragraphs ready for TTS

  -> Edge-TTS -> MP3
```

The whole pipeline is in [`backend/app/services/pdf/pipeline.py`](backend/app/services/pdf/pipeline.py), about 620 lines.

## Numbers from the benchmark

| Run | F1 | WER | Latency | Health | Noise | Notes |
|---|---|---|---|---|---|---|
| RUN-0005 | 1.00 | 0.0% | 25 ms | 1.00 | 5/5 | Synthetic benchmark PDF |
| RUN-0004 | 0.84 | 2.9% | 463 ms | 0.74 | 0/4 | Real book, missed all the noise |
| RUN-0006 | 0.84 | 2.9% | 478 ms | 0.85 | 0/4 | Same problem on a different book |

The synthetic PDF has clean structure and obvious noise patterns, so the heuristics nail it. Real books have publisher-specific running headers that the heuristics either don't catch, or catch alongside legitimate body text.

## Run it

No API key needed.

```bash
cp ../../.env.example .env
docker compose up -d --build
```

Frontend on http://localhost:3000, backend on http://localhost:8000.

## Why this got replaced

PyMuPDF returns whatever the PDF renderer produces. When a publisher embeds the running header into every page (and most do), there's no purely-heuristic way to tell that block apart from a real heading without per-publisher tuning. v2 fixed this by having Gemini look at sample pages and tell the pipeline what to expect.
