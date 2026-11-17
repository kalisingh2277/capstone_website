/* paperdata.js — every number below is taken from the IEOM 2026 paper
 * "A ConvLSTM Framework for Faint Moving-Source Detection in Astronomical
 * Image Sequences" (Tables 2, 4, 5, 6). Edit here if the paper changes. */

export const HEADLINE = {
  precision: 0.9297, recall: 0.8633, f1: 0.8953,
  locErrPx: 3.024, velErrPxPerFrame: 3.161,
  heldOutTracklets: 20,
};

// Table 5 — detection performance on the held-out evaluation set
export const DETECTION = [
  { scenario: "One injection",    n: 1, tp: 128, fp: 1,  fn: 12,  precision: 0.9922, recall: 0.9143, f1: 0.9517, accuracy: 0.96 },
  { scenario: "Two injections",   n: 2, tp: 248, fp: 9,  fn: 32,  precision: 0.9650, recall: 0.8857, f1: 0.9236, accuracy: 0.90 },
  { scenario: "Three injections", n: 3, tp: 366, fp: 22, fn: 54,  precision: 0.9433, recall: 0.8714, f1: 0.9059, accuracy: 0.85 },
  { scenario: "Four injections",  n: 4, tp: 489, fp: 41, fn: 71,  precision: 0.9226, recall: 0.8732, f1: 0.8972, accuracy: 0.80 },
  { scenario: "Five injections",  n: 5, tp: 582, fp: 64, fn: 118, precision: 0.9009, recall: 0.8314, f1: 0.8648, accuracy: 0.72 },
];
export const DETECTION_COMBINED = { scenario: "Combined", tp: 1813, fp: 137, fn: 287, precision: 0.9297, recall: 0.8633, f1: 0.8953, accuracy: 0.856 };

// Table 6 — localisation & motion
export const LOCALIZATION = [
  { scenario: "One injection",    n: 1, matched: 128, locErr: 3.036, velErr: 2.984 },
  { scenario: "Two injections",   n: 2, matched: 248, locErr: 2.997, velErr: 3.183 },
  { scenario: "Three injections", n: 3, matched: 366, locErr: 3.024, velErr: 3.139 },
  { scenario: "Four injections",  n: 4, matched: 489, locErr: 2.802, velErr: 3.028 },
  { scenario: "Five injections",  n: 5, matched: 582, locErr: 3.173, velErr: 3.326 },
];
export const LOCALIZATION_COMBINED = { matched: 1813, locErr: 3.024, velErr: 3.161 };

export const EVAL_SETTINGS = [
  ["Confidence threshold", "0.85"],
  ["NMS radius", "12 px"],
  ["Match tolerance δ", "10 px in ≥ 50% of valid frames"],
  ["Held-out tracklets", "20"],
  ["Positive samples / scenario", "140 (7 per tracklet)"],
  ["Negative samples / tracklet", "7"],
];

// Table 2
export const DATASET = {
  source: "DECam FITS tracklets (NOIRLab Astro Data Archive)",
  tracklets: 103, samples: 1648, perTracklet: 16, positives: 8, negatives: 8,
  minFrames: 3, crop: "1024 × 1024", velocity: "50–75 px / frame",
  split: [{ name: "Training", pct: 60 }, { name: "Validation", pct: 20 }, { name: "Held-out evaluation", pct: 20 }],
};

// Table 4
export const TRAINING = [
  ["Model", "Bidirectional ConvLSTM detector"],
  ["Epochs", "60 (best checkpoint: epoch 60)"],
  ["Optimizer", "AdamW"],
  ["Initial learning rate", "1 × 10⁻⁴"],
  ["Weight decay", "1 × 10⁻⁴"],
  ["LR schedule", "Cosine annealing → 1 × 10⁻⁶"],
  ["Batch size", "1 sequence"],
  ["Mixed precision", "Enabled when supported"],
  ["Gradient clipping", "max-norm 5.0"],
];
