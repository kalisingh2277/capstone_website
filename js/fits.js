/* fits.js — tiny, dependency-free FITS reader for browser previews.
 * Supports BITPIX 8/16/32/-32/-64 (and 64 best-effort), BSCALE/BZERO,
 * multi-extension files (picks the first HDU with a 2-D image, e.g. DECam).
 * Previews use an asinh stretch between robust percentiles.
 * Note: compressed .fz / tile-compressed images are not decoded here —
 * the API still receives the original file untouched. */

const BLOCK = 2880;

function parseHeader(view, offset) {
  const cards = {};
  const order = [];
  let pos = offset;
  const dec = new TextDecoder("ascii");
  while (pos + 80 <= view.byteLength) {
    const card = dec.decode(new Uint8Array(view.buffer, view.byteOffset + pos, 80));
    pos += 80;
    const key = card.slice(0, 8).trim();
    if (key === "END") break;
    if (card[8] === "=" && key) {
      let raw = card.slice(10);
      let val;
      const s = raw.trim();
      if (s.startsWith("'")) {
        const end = s.indexOf("'", 1);
        val = s.slice(1, end > 0 ? end : undefined).trim();
      } else {
        const v = s.split("/")[0].trim();
        if (v === "T") val = true; else if (v === "F") val = false;
        else val = isNaN(+v) ? v : +v;
      }
      cards[key] = val; order.push(key);
    }
  }
  const headerEnd = Math.ceil((pos - offset) / BLOCK) * BLOCK + offset;
  return { cards, headerEnd };
}

function dataBytes(h) {
  const naxis = h.NAXIS || 0;
  if (!naxis) return 0;
  let n = Math.abs(h.BITPIX) / 8;
  for (let i = 1; i <= naxis; i++) n *= h[`NAXIS${i}`] || 0;
  const pcount = h.PCOUNT || 0, gcount = h.GCOUNT || 1;
  return (n + pcount) * gcount;
}

/** Parse the first 2-D image HDU. Returns { width, height, data: Float32Array, header } */
export function readFits(buffer) {
  const view = new DataView(buffer);
  let offset = 0;
  let guard = 0;
  let primary = null; // keep primary-header cards (DECam puts DATE-OBS there)
  while (offset < buffer.byteLength && guard++ < 64) {
    const { cards, headerEnd } = parseHeader(view, offset);
    const nbytes = dataBytes(cards);
    if (!primary) primary = cards;
    const isImage = (cards.SIMPLE !== undefined || cards.XTENSION === "IMAGE") && (cards.NAXIS || 0) >= 2;
    if (isImage && !cards.ZIMAGE) {
      const w = cards.NAXIS1, h = cards.NAXIS2;
      const bitpix = cards.BITPIX;
      const bscale = cards.BSCALE ?? 1, bzero = cards.BZERO ?? 0;
      const n = w * h; // first plane only
      const out = new Float32Array(n);
      let p = headerEnd;
      const bpp = Math.abs(bitpix) / 8;
      if (headerEnd + n * bpp > buffer.byteLength) throw new Error("FITS file looks truncated.");
      for (let i = 0; i < n; i++, p += bpp) {
        let v;
        switch (bitpix) {
          case 8: v = view.getUint8(p); break;
          case 16: v = view.getInt16(p, false); break;
          case 32: v = view.getInt32(p, false); break;
          case 64: v = Number(view.getBigInt64(p, false)); break;
          case -32: v = view.getFloat32(p, false); break;
          case -64: v = view.getFloat64(p, false); break;
          default: throw new Error(`Unsupported BITPIX ${bitpix}`);
        }
        out[i] = v * bscale + bzero;
      }
      return { width: w, height: h, data: out, header: { ...primary, ...cards } };
    }
    if (cards.ZIMAGE) throw new Error("Tile-compressed FITS (.fz) can't be previewed in the browser, but will still be sent to the API.");
    offset = headerEnd + Math.ceil(nbytes / BLOCK) * BLOCK;
  }
  throw new Error("No 2-D image found in this FITS file.");
}

function skyStats(data) {
  const step = Math.max(1, Math.floor(data.length / 250000));
  const s = [];
  for (let i = 0; i < data.length; i += step) { const v = data[i]; if (Number.isFinite(v)) s.push(v); }
  if (!s.length) return { median: 0, sigma: 1, p999: 1 };
  s.sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(p * (arr.length - 1))))];
  const median = q(s, 0.5);
  const dev = s.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const sigma = 1.4826 * q(dev, 0.5) || (q(s, 0.99) - q(s, 0.01)) / 6 || 1;
  return { median, sigma, p999: q(s, 0.999) };
}

/** Render to a canvas (downscaled to maxSide). Returns the canvas. */
export function fitsToCanvas(fits, { maxSide = 1024, flipY = false } = {}) {
  const { width: w, height: h, data } = fits;
  // Robust sky stretch (median / MAD, as in the paper's normalisation):
  // black just below the sky, white well above the noise.
  const { median, sigma, p999 } = skyStats(data);
  const lo = median - 1.5 * sigma;
  const hi = Math.max(median + 30 * sigma, Math.min(p999, median + 400 * sigma));
  const range = hi - lo || 1;
  const k = 10; // asinh softening
  const norm = Math.asinh(k);

  const full = document.createElement("canvas");
  full.width = w; full.height = h;
  const ctx = full.getContext("2d");
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const srcRow = flipY ? h - 1 - y : y;
    for (let x = 0; x < w; x++) {
      const v = data[srcRow * w + x];
      let t = Number.isFinite(v) ? (v - lo) / range : 0;
      t = t <= 0 ? 0 : t >= 1 ? 1 : Math.asinh(k * t) / norm;
      const c = t * 255, o = (y * w + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = c; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const scale = Math.min(1, maxSide / Math.max(w, h));
  if (scale === 1) return full;
  const small = document.createElement("canvas");
  small.width = Math.round(w * scale); small.height = Math.round(h * scale);
  const sctx = small.getContext("2d");
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(full, 0, 0, small.width, small.height);
  return small;
}

/** Best-effort observation time from header (for "sort by time"). */
export function fitsTime(header) {
  if (header["MJD-OBS"] != null) return (+header["MJD-OBS"] - 40587) * 86400000;
  const d = header["DATE-OBS"];
  if (d) {
    const t = Date.parse(d.endsWith("Z") || d.includes("+") ? d : d + "Z");
    if (!isNaN(t)) return t;
  }
  return null;
}
