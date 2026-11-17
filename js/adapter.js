/* adapter.js — turns whatever the API returns into ONE normalized shape
 * that the rest of the UI understands. Change js/config.js, not this file. */
import { CONFIG } from "./config.js";

export const get = (obj, path) => {
  if (obj == null || !path) return undefined;
  return String(path).split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
};

const num = (v) => (v === null || v === undefined || v === "" || isNaN(+v) ? null : +v);

function toImageSrc(v) {
  if (!v || typeof v !== "string") return null;
  if (v.startsWith("data:") || /^(https?:|blob:|\/|\.)/.test(v)) return v;
  return `data:image/png;base64,${v}`; // bare base64
}

function normPositions(rawPositions, map) {
  if (!Array.isArray(rawPositions)) return [];
  return rawPositions
    .map((p, i) => {
      if (Array.isArray(p)) {
        // [x, y] or [frame, x, y]
        return p.length >= 3 ? { frame: +p[0], x: +p[1], y: +p[2] } : { frame: i, x: +p[0], y: +p[1] };
      }
      const f = num(get(p, map.frame));
      return { frame: f ?? i, x: num(get(p, map.x)), y: num(get(p, map.y)) };
    })
    .filter((p) => p.x !== null && p.y !== null);
}

function normVelocity(v, map) {
  if (!v) return null;
  if (Array.isArray(v)) return { vx: +v[0], vy: +v[1] };
  const vx = num(get(v, map.vx)), vy = num(get(v, map.vy));
  return vx === null || vy === null ? null : { vx, vy };
}

function normTrack(d, idx, nFrames, refFrame) {
  const m = CONFIG.responseMap;
  const velocity = normVelocity(get(d, m.det.velocity), m.vel);
  let positions = normPositions(get(d, m.det.positions), m.pos);

  // Paper, Eq. (2): x_t = x_r + vx (t - t_r). Reconstruct when only a
  // reference-frame centre + velocity are returned.
  const center = get(d, m.det.center);
  if (!positions.length && center && velocity) {
    const cx = num(Array.isArray(center) ? center[0] : center.x);
    const cy = num(Array.isArray(center) ? center[1] : center.y);
    if (cx !== null && cy !== null) {
      positions = Array.from({ length: nFrames }, (_, t) => ({
        frame: t, x: cx + velocity.vx * (t - refFrame), y: cy + velocity.vy * (t - refFrame), reconstructed: true,
      }));
    }
  }
  positions.sort((a, b) => a.frame - b.frame);

  let conf = num(get(d, m.det.confidence));
  if (conf !== null && conf > 1) conf = conf / 100;

  const speed = velocity ? Math.hypot(velocity.vx, velocity.vy) : estimateSpeed(positions);
  return {
    id: get(d, m.det.id) ?? idx + 1,
    label: get(d, m.det.label) ?? null,
    confidence: conf,
    velocity,
    speed,
    positions,
  };
}

function estimateSpeed(pos) {
  if (pos.length < 2) return null;
  const a = pos[0], b = pos[pos.length - 1];
  const df = b.frame - a.frame || 1;
  return Math.hypot(b.x - a.x, b.y - a.y) / df;
}

/**
 * @param {any} raw            the API JSON
 * @param {object} ctx         { nFrames, roundTripMs, uploadDims: {w,h} }
 */
export function normalizeResponse(raw, ctx) {
  if (typeof CONFIG.transformResponse === "function") {
    const out = CONFIG.transformResponse(raw, ctx);
    return { ...defaults(ctx), ...out, raw };
  }
  const m = CONFIG.responseMap;
  const nFrames = ctx.nFrames;
  const refRaw = num(get(raw, m.referenceFrame));
  const referenceFrame = refRaw ?? Math.floor(nFrames / 2);

  const dets = get(raw, m.detections);
  const detections = (Array.isArray(dets) ? dets : []).map((d, i) => normTrack(d, i, nFrames, referenceFrame));

  const gt = get(raw, m.groundTruth);
  const groundTruth = (Array.isArray(gt) ? gt : []).map((d, i) => normTrack(d, i, nFrames, referenceFrame));

  let imageSize = get(raw, m.imageSize);
  if (Array.isArray(imageSize)) imageSize = { w: +imageSize[0], h: +imageSize[1] };
  else if (imageSize && typeof imageSize === "object")
    imageSize = { w: +(imageSize.width ?? imageSize.w), h: +(imageSize.height ?? imageSize.h) };
  else imageSize = ctx.uploadDims || null;

  const ann = get(raw, m.annotatedFrames);
  const annotatedFrames = Array.isArray(ann) ? ann.map(toImageSrc) : [];

  const procMs = num(get(raw, m.processingTime));
  const metricsRaw = get(raw, m.metrics);

  return {
    nFrames,
    referenceFrame,
    imageSize,
    detections,
    groundTruth,
    annotatedFrames,
    processingTimeMs: procMs,
    roundTripMs: ctx.roundTripMs ?? null,
    metrics: metricsRaw && typeof metricsRaw === "object" ? metricsRaw : {},
    downloadUrl: get(raw, m.downloadUrl) || null,
    message: get(raw, m.message) || null,
    raw,
  };
}

function defaults(ctx) {
  return {
    nFrames: ctx.nFrames, referenceFrame: Math.floor(ctx.nFrames / 2), imageSize: ctx.uploadDims || null,
    detections: [], groundTruth: [], annotatedFrames: [], processingTimeMs: null,
    roundTripMs: ctx.roundTripMs ?? null, metrics: {}, downloadUrl: null, message: null,
  };
}

/** position of a track at a frame (exact, else linear interpolation) */
export function positionAt(track, frame) {
  const p = track.positions;
  if (!p.length) return null;
  const exact = p.find((q) => q.frame === frame);
  if (exact) return exact;
  return null;
}
