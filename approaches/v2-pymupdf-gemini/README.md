# v2: PyMuPDF + Gemini calibrator

The middle step. Gemini analyzes a few sample pages and gives the heuristic pipeline a layout profile to work with. Most of the prompt-engineering work I did lives here, including the DELETE-instruction trick.

## What it does

Same PyMuPDF pipeline as v1, but with two additions: an upstream calibration call to Gemini that produces a `LayoutProfile`, and a downstream extraction step that uses Gemini to pick out what to keep.

```
PDF -> render 6-8 sample pages -> Gemini -> LayoutProfile JSON
                                            (header zones, font sizes,
                                             page-num position, etc.)

PDF -> PyMuPDF spatial extraction -> 10 stages using the profile:
  1. Spatial extraction
  2. TOC extraction              bookmarks first, then text-based, font as fallback
  3. Pattern filter              header/footer text from Gemini
  4. Repetition filter
  5. Positional filter           Gemini-calibrated zones
  6. Page number detector
  7. TOC-based heading marker    blocks matching TOC entries
  8. Watermark detector          Gemini-identified or default keywords
  9. Reading order
  10. Text assembly

-> Edge-TTS -> MP3
```

(The Kokoro variant tested in RUN-0019 used the same v2 architecture with the TTS engine swapped. The code in this folder ships with Edge-TTS; v3 has the production Kokoro setup.)

Two main files:
- [`backend/app/services/pdf/gemini_calibrator.py`](backend/app/services/pdf/gemini_calibrator.py), ~380 lines
- [`backend/app/services/pdf/pipeline.py`](backend/app/services/pdf/pipeline.py), ~800 lines

## The DELETE-instruction trick

The first version of the extractor sent raw text to Gemini and got back the cleaned text. For a 256-page book that was about 318 output tokens per page, around 195K total at $0.078.

I switched to sending Gemini numbered lines and asking for a small JSON object with three fields:

```json
{
  "delete": [12, 13, 47, 48],
  "titles": {"1": "Chapter 1", "234": "Chapter 7"},
  "headings": {"15": "Section 1.1", "67": "Section 2.3"}
}
```

That's about 15 output tokens per page, roughly 120K total at $0.017, which is 78% cheaper. Bumping the batch size from 20 to 40 pages also cut the number of API calls from 13 to 7.

## Numbers from the benchmark

| Run | F1 | WER | Latency | Health | Noise | TTS | Notes |
|---|---|---|---|---|---|---|---|
| RUN-0007 | 0.87 | 18.5% | 559 ms | 0.80 | 0/4 | Edge | Gemini post-process, no calibration |
| RUN-0008 | 0.87 | 18.5% | 448 ms | 0.80 | 0/4 | Edge | Same setup, repeated |
| RUN-0010 | 1.00 | 0.0% | 10408 ms | 0.72 | 5/5 | Edge | First time the calibration worked |
| RUN-0016 | 1.00 | 0.0% | 23814 ms | 0.85 | 5/5 | Edge | Calibration upstream, stable from here on |
| RUN-0018 | 1.00 | 15.1% | 25803 ms | 0.81 | 0/4 | Edge | WER plateau traced to text normalization |
| RUN-0019 | 1.00 | 15.1% | 25752 ms | 0.81 | 0/4 | Kokoro | Switched to Kokoro |

The lesson across these is that calibration matters. Without it, three of seven runs collapsed (not shown above, see the top-level README table for those). With it, F1 stayed at 1.0 across every run after RUN-0010.

The 15.1% WER plateau is misleading: Gemini occasionally normalizes text (expanding abbreviations, smoothing whitespace) which inflates word-level edit distance even though the meaning is preserved.

## Run it

You'll need a free Gemini API key from https://aistudio.google.com/app/apikey.

```bash
cp ../../.env.example .env
# edit .env, set GEMINI_API_KEY=AIza...
docker compose up -d --build
```

Frontend on http://localhost:3000, backend on http://localhost:8000.

## Why this got replaced

v2 works, but it's about 1,200 lines of pipeline code. v3 hits the same accuracy with about 370 lines because it lets Gemini handle both calibration and extraction directly.
