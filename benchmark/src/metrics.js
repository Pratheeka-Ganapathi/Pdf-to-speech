import {
  NOISE_PATTERNS, EXPECTED_STRUCTURE, BODY_KEYS, HETERONYMS, REFERENCE_TEXT,
} from './constants.js';

/** Normalize text for comparison */
export function normalize(text) {
  return text
    .replace(/[\u201c\u201d\u2018\u2019]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Layout F1-Score - measures structural integrity
 * Checks: structural elements found, body content present, noise filtered, reading order
 */
export function computeLayoutF1(extractedText) {
  const lower = normalize(extractedText);

  const structFound = EXPECTED_STRUCTURE.filter(s => lower.includes(s.key));
  const bodyFound = BODY_KEYS.filter(b => lower.includes(b));
  const noisePresent = NOISE_PATTERNS.filter(n => lower.includes(n));
  const noiseFiltered = NOISE_PATTERNS.length - noisePresent.length;

  // Check reading order of structural elements
  let orderScore = 0;
  let lastIdx = -1;
  for (const s of EXPECTED_STRUCTURE) {
    const idx = lower.indexOf(s.key);
    if (idx > lastIdx && idx !== -1) { orderScore++; lastIdx = idx; }
  }

  // Check reading order of body content
  let bodyOrderScore = 0;
  lastIdx = -1;
  for (const b of BODY_KEYS) {
    const idx = lower.indexOf(b);
    if (idx > lastIdx && idx !== -1) { bodyOrderScore++; lastIdx = idx; }
  }

  // TP = correctly found content + correctly removed noise
  // FP = noise still present
  // FN = content missing
  const tp = structFound.length + bodyFound.length + noiseFiltered;
  const fp = noisePresent.length;
  const fn = (EXPECTED_STRUCTURE.length - structFound.length) + (BODY_KEYS.length - bodyFound.length);

  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    f1: +f1.toFixed(3),
    precision: +precision.toFixed(3),
    recall: +recall.toFixed(3),
    structFound: structFound.length,
    structTotal: EXPECTED_STRUCTURE.length,
    bodyFound: bodyFound.length,
    bodyTotal: BODY_KEYS.length,
    noiseFiltered,
    noiseTotal: NOISE_PATTERNS.length,
    noisePresent,
    orderScore,
    bodyOrderScore,
    missingStructure: EXPECTED_STRUCTURE.filter(s => !lower.includes(s.key)).map(s => s.key),
    missingBody: BODY_KEYS.filter(b => !lower.includes(b)),
  };
}

/**
 * Word Error Rate - Levenshtein distance at word level
 */
export function computeWER(extractedText) {
  const ref = normalize(REFERENCE_TEXT).split(/\s+/);
  const hyp = normalize(extractedText).split(/\s+/);
  const m = ref.length;
  const n = hyp.length;

  if (m === 0) return { wer: n > 0 ? 1 : 0, edits: 0, refWords: 0, hypWords: n };

  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return {
    wer: +(prev[n] / m).toFixed(4),
    edits: prev[n],
    refWords: m,
    hypWords: n,
  };
}

/**
 * Real-Time Factor - synthesis time / audio duration
 */
export function computeRTF(synthesisTimeSec, audioDurationSec) {
  if (audioDurationSec <= 0) return { rtf: 0, rating: "N/A" };
  const rtf = synthesisTimeSec / audioDurationSec;
  const rating = rtf > 1 ? "Critical" : rtf > 0.5 ? "Poor" : rtf > 0.2 ? "Good" : "Excellent";
  return { rtf: +rtf.toFixed(3), rating };
}

/**
 * MOS Proxy - word boundary timing analysis
 * Analyzes rhythm regularity, pause patterns, and speech rate
 */
export function computeMOSProxy(wordBoundaries) {
  if (!wordBoundaries || wordBoundaries.length < 5) {
    return { mos: 0, method: "insufficient_data", details: {} };
  }

  const intervals = [];
  for (let i = 1; i < wordBoundaries.length; i++) {
    const gap = wordBoundaries[i].time_ms - wordBoundaries[i - 1].time_ms;
    if (gap > 0) intervals.push(gap);
  }
  if (intervals.length < 3) return { mos: 0, method: "insufficient_data", details: {} };

  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const std = Math.sqrt(intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length);
  const cv = mean > 0 ? std / mean : 0;

  // Natural speech: CV ~0.30-0.70 (varied but not chaotic)
  let rhythmScore;
  if (cv >= 0.30 && cv <= 0.70) rhythmScore = 4.5;
  else if (cv >= 0.20 && cv <= 0.85) rhythmScore = 3.8;
  else if (cv >= 0.10 && cv <= 1.00) rhythmScore = 3.0;
  else rhythmScore = 2.0;

  // Pause patterns: longer gaps after punctuation = more natural
  let pauseScore = 3.0;
  for (let i = 0; i < wordBoundaries.length - 1; i++) {
    const gap = wordBoundaries[i + 1].time_ms - wordBoundaries[i].time_ms;
    const word = wordBoundaries[i].text || "";
    if (/[.!?,]$/.test(word) && gap > mean * 1.3) pauseScore += 0.15;
  }
  pauseScore = Math.min(5, Math.max(1, pauseScore));

  // Speech rate: 120-180 WPM is natural
  const totalDurationMin = (wordBoundaries[wordBoundaries.length - 1].time_ms - wordBoundaries[0].time_ms) / 60000;
  const wpm = totalDurationMin > 0 ? wordBoundaries.length / totalDurationMin : 0;
  let speedScore;
  if (wpm >= 120 && wpm <= 180) speedScore = 4.5;
  else if (wpm >= 100 && wpm <= 200) speedScore = 3.8;
  else if (wpm >= 80 && wpm <= 220) speedScore = 3.0;
  else speedScore = 2.5;

  const mos = Math.min(5, Math.max(1, +(rhythmScore * 0.4 + pauseScore * 0.35 + speedScore * 0.25).toFixed(1)));

  return {
    mos,
    method: "word_boundary_analysis",
    details: {
      cv: +cv.toFixed(2),
      rhythmScore,
      pauseScore: +pauseScore.toFixed(1),
      speedScore,
      wpm: Math.round(wpm),
    },
  };
}

/**
 * WSD Accuracy - checks if heteronym context sentences survive extraction
 */
export function computeWSD(extractedText) {
  const lower = normalize(extractedText);
  let found = 0;
  let total = 0;

  const details = HETERONYMS.map(h => {
    total += 2;
    const c1 = lower.includes(h.context1);
    const c2 = lower.includes(h.context2);
    if (c1) found++;
    if (c2) found++;
    return { word: h.word, context1Found: c1, context2Found: c2 };
  });

  return {
    accuracy: total > 0 ? +(found / total).toFixed(3) : 0,
    found,
    total,
    details,
  };
}

/**
 * Harmonic Mean - System Health score
 * Punishes weak links heavily
 */
export function harmonicMean(values) {
  const valid = values.filter(v => v > 0);
  if (valid.length === 0) return 0;
  return +(valid.length / valid.reduce((sum, v) => sum + 1 / v, 0)).toFixed(3);
}
