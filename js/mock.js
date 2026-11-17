/* mock.js — DEMO MODE ONLY.
 * 1) generateSampleTracklet(): synthesises a DECam-like star field sequence
 *    with injected moving point sources (Gaussian PSF, 50–75 px/frame,
 *    the same recipe as the paper's synthetic benchmark).
 * 2) mockDetect(): a fake API that answers in the DEFAULT response contract,
 *    so the full adapter → viewer → results path is exercised before the
 *    real endpoint exists. Delete nothing here when going live: it is only
 *    used when CONFIG.api.url is empty. */

const sampleTruth = new WeakMap(); // File -> { index, tracks, size }

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function addPSF(buf, size, cx, cy, amp, sigma) {
  const r = Math.ceil(sigma * 4);
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(size - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(size - 1, Math.ceil(cy + r));
  const s2 = 2 * sigma * sigma;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      buf[y * size + x] += amp * Math.exp(-d2 / s2);
    }
  }
}

/** @returns {Promise<File[]>} */
export async function generateSampleTracklet({ frames = 5, size = 1024, nSources = 2, seed = Date.now() % 1e6 } = {}) {
  const rng = mulberry32(seed);
  const tr = Math.floor(frames / 2);

  // static sky
  const sky = new Float32Array(size * size);
  const nStars = 420;
  for (let i = 0; i < nStars; i++) {
    const bright = rng() ** 4;
    addPSF(sky, size, rng() * size, rng() * size, 8 + bright * 260, 1.1 + rng() * 1.6 + bright * 2.2);
  }
  for (let i = 0; i < 3; i++) { // a couple of fuzzy galaxies
    addPSF(sky, size, rng() * size, rng() * size, 30 + rng() * 40, 5 + rng() * 6);
  }

  // moving sources (paper: 50–75 px/frame), must stay inside the crop
  const tracks = [];
  let guard = 0;
  while (tracks.length < nSources && guard++ < 500) {
    const speed = 50 + rng() * 25;
    const ang = rng() * Math.PI * 2;
    const vx = Math.cos(ang) * speed, vy = Math.sin(ang) * speed;
    const xr = 80 + rng() * (size - 160), yr = 80 + rng() * (size - 160);
    const pos = Array.from({ length: frames }, (_, t) => ({
      frame: t, x: xr + vx * (t - tr) + gauss(rng) * 0.6, y: yr + vy * (t - tr) + gauss(rng) * 0.6,
    }));
    if (pos.every((p) => p.x > 20 && p.y > 20 && p.x < size - 20 && p.y < size - 20)) {
      tracks.push({ id: tracks.length + 1, vx, vy, xr, yr, amp: 38 + rng() * 40, sigma: 1.5 + rng() * 0.8, positions: pos });
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const files = [];
  const t0 = new Date("2026-03-14T03:12:00Z").getTime();

  for (let t = 0; t < frames; t++) {
    const buf = new Float32Array(sky);
    const bg = 18 + rng() * 6;
    for (const trk of tracks) addPSF(buf, size, trk.positions[t].x, trk.positions[t].y, trk.amp, trk.sigma);
    if (rng() < 0.7) { // a cosmic ray, to keep it honest
      addPSF(buf, size, rng() * size, rng() * size, 180, 0.7);
    }
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let i = 0; i < buf.length; i++) {
      const v = bg + buf[i] + gauss(rng) * 5.5;
      const s = 255 * Math.asinh(Math.max(0, v) / 22) / Math.asinh(300 / 22);
      const c = s < 0 ? 0 : s > 255 ? 255 : s;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = c; d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    const stamp = new Date(t0 + t * 90_000).toISOString().replace(/[:]/g, "").slice(0, 15);
    const file = new File([blob], `demo_tracklet_t${t}_${stamp}.png`, { type: "image/png", lastModified: t0 + t * 90_000 });
    sampleTruth.set(file, { index: t, tracks, size });
    files.push(file);
  }
  return files;
}

const sleep = (ms, signal) => new Promise((res, rej) => {
  const id = setTimeout(res, ms);
  signal?.addEventListener("abort", () => { clearTimeout(id); rej(new Error("cancelled")); });
});

/** Fake API. Returns JSON in the default contract (see README). */
export async function mockDetect(items, { signal } = {}) {
  const n = items.length;
  const t0 = performance.now();
  await sleep(900 + Math.random() * 900, signal);
  const rng = mulberry32(Math.floor(Math.random() * 1e9));
  const tr = Math.floor(n / 2);

  const truthInfo = items.map((it) => sampleTruth.get(it.file));
  const allSample = truthInfo.every(Boolean);
  const w = allSample ? truthInfo[0].size : items[0].dims?.w || 1024;
  const h = allSample ? truthInfo[0].size : items[0].dims?.h || 1024;

  let truthTracks = [];
  if (allSample) {
    // follow the user's current ordering (reordering breaks straight lines — on purpose)
    truthTracks = truthInfo[0].tracks.map((trk) => ({
      id: trk.id,
      velocity: { vx: trk.vx, vy: trk.vy },
      positions: truthInfo.map((ti, frame) => ({ frame, x: trk.positions[ti.index].x, y: trk.positions[ti.index].y })),
    }));
  } else {
    const k = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < k; i++) {
      const speed = Math.min(w, h) * (0.03 + rng() * 0.03);
      const a = rng() * Math.PI * 2;
      const vx = Math.cos(a) * speed, vy = Math.sin(a) * speed;
      const xr = w * (0.25 + rng() * 0.5), yr = h * (0.25 + rng() * 0.5);
      truthTracks.push({
        id: i + 1, velocity: { vx, vy },
        positions: Array.from({ length: n }, (_, t) => ({ frame: t, x: xr + vx * (t - tr), y: yr + vy * (t - tr) })),
      });
    }
  }

  const detections = truthTracks.map((trk, i) => {
    const j = () => gauss(rng) * 2.2; // ~3 px median localisation error, like Table 6
    const positions = trk.positions.map((p) => ({ frame: p.frame, x: +(p.x + j()).toFixed(2), y: +(p.y + j()).toFixed(2) }));
    const ref = positions[tr] || positions[0];
    return {
      id: i + 1,
      confidence: +(0.86 + rng() * 0.13).toFixed(4),
      center: { x: ref.x, y: ref.y },
      velocity: { vx: +(trk.velocity.vx + gauss(rng) * 2.2).toFixed(2), vy: +(trk.velocity.vy + gauss(rng) * 2.2).toFixed(2) },
      positions,
    };
  });

  return {
    status: "success",
    model: "BiConvLSTM (demo stub)",
    processing_time_ms: Math.round(performance.now() - t0 - 400 + rng() * 120),
    num_frames: n,
    reference_frame: tr,
    image_size: [w, h],
    detections,
    ground_truth: allSample
      ? truthTracks.map((t) => ({ id: t.id, positions: t.positions.map((p) => ({ frame: p.frame, x: +p.x.toFixed(2), y: +p.y.toFixed(2) })) }))
      : [],
    annotated_frames: [],
    metrics: {
      confidence_threshold: 0.85,
      nms_radius_px: 12,
      candidates_before_nms: detections.length + Math.floor(rng() * 4),
      heatmap_resolution: "256 × 256",
    },
    message: allSample
      ? "Demo stub: detections are simulated from the injected ground truth."
      : "Demo stub: no API configured, these detections are random placeholders.",
  };
}
