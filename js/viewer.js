/* viewer.js — frame-by-frame player with detection overlays */
import { CONFIG } from "./config.js";

export class FrameViewer {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.$ = (s) => root.querySelector(s);
    this.frame = 0;
    this.playing = false;
    this.speed = CONFIG.viewer.defaultSpeed;
    this.layers = { pred: true, traj: true, gt: true, labels: true };
    this.mode = "overlay";
    this.selected = null;
    this.onFrameChange = () => {};
    this.onSelect = () => {};
    this.annotated = [];
    this.registered = [];
    this._bind();
    new ResizeObserver(() => this.draw()).observe(this.canvas.parentElement);
  }

  _bind() {
    const $ = this.$;
    $("[data-v=play]").addEventListener("click", () => this.toggle());
    $("[data-v=prev]").addEventListener("click", () => { this.pause(); this.go(this.frame - 1); });
    $("[data-v=next]").addEventListener("click", () => { this.pause(); this.go(this.frame + 1); });
    $("[data-v=first]").addEventListener("click", () => { this.pause(); this.go(0); });
    $("[data-v=last]").addEventListener("click", () => { this.pause(); this.go(this.n - 1); });
    const sp = $("[data-v=speed]");
    sp.innerHTML = CONFIG.viewer.speeds.map((s) => `<option value="${s}" ${s === this.speed ? "selected" : ""}>${s}×</option>`).join("");
    sp.addEventListener("change", () => { this.speed = +sp.value; });
    $("[data-v=scrub]").addEventListener("input", (e) => { this.pause(); this.go(+e.target.value); });
    this.root.querySelectorAll("[data-layer]").forEach((cb) =>
      cb.addEventListener("change", () => { this.layers[cb.dataset.layer] = cb.checked; this.draw(); })
    );
    this.root.querySelectorAll("[name=vmode]").forEach((r) =>
      r.addEventListener("change", () => { if (r.checked) { this.mode = r.value; this.draw(); } })
    );
    this.root.addEventListener("keydown", (e) => {
      if (e.target.closest("select,input")) return;
      if (e.key === " ") { e.preventDefault(); this.toggle(); }
      if (e.key === "ArrowRight") { e.preventDefault(); this.pause(); this.go(this.frame + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); this.pause(); this.go(this.frame - 1); }
    });
    this.canvas.addEventListener("mousemove", (e) => this._hover(e));
    this.canvas.addEventListener("mouseleave", () => { $("[data-v=readout]").textContent = "hover the image for pixel coordinates"; this.hoverId = null; this.draw(); });
    this.canvas.addEventListener("click", () => { if (this.hoverId != null) this.select(this.hoverId === this.selected ? null : this.hoverId); });
  }

  get n() { return this.items?.length || 0; }

  load(result, items) {
    this.result = result;
    this.items = items;
    this.frame = Math.min(result.referenceFrame ?? 0, items.length - 1);
    this.selected = null;
    this.annotated = [];
    this.registered = (result.registeredFrames || []).map((src) => {
      if (!src) return null;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { this.draw(); this._thumbs(); };
      img.src = src;
      return img;
    });
    const hasAnn = result.annotatedFrames.some(Boolean);
    const modeBox = this.$("[data-v=modes]");
    modeBox.hidden = !hasAnn;
    this.mode = hasAnn ? "annotated" : "overlay";
    this.root.querySelectorAll("[name=vmode]").forEach((r) => (r.checked = r.value === this.mode));
    if (hasAnn) {
      this.annotated = result.annotatedFrames.map((src) => {
        if (!src) return null;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => this.draw();
        img.src = src;
        return img;
      });
    }
    const gtBox = this.$("[data-layer=gt]")?.closest("label");
    if (gtBox) gtBox.hidden = !result.groundTruth.length;
    const scrub = this.$("[data-v=scrub]");
    scrub.max = String(items.length - 1);
    this._thumbs();
    this.go(this.frame);
  }

  _thumbs() {
    const strip = this.$("[data-v=thumbs]");
    strip.innerHTML = "";
    this.items.forEach((it, i) => {
      const b = document.createElement("button");
      b.className = "thumb";
      b.setAttribute("aria-label", `Frame ${i}`);
      const reg = this.registered[i];
      const src = reg?.complete && reg.naturalWidth ? reg.src : it.thumb;
      b.innerHTML = `<img src="${src}" alt=""><span>t${i}${i === this.result.referenceFrame ? " · ref" : ""}</span>`;
      b.addEventListener("click", () => { this.pause(); this.go(i); });
      strip.appendChild(b);
    });
  }

  go(i) {
    if (!this.n) return;
    this.frame = ((i % this.n) + this.n) % this.n;
    this.$("[data-v=scrub]").value = String(this.frame);
    const ref = this.frame === this.result.referenceFrame ? `<em>reference frame</em>` : "";
    this.$("[data-v=counter]").innerHTML = `Frame <b>${this.frame + 1}</b> / ${this.n} ${ref}`;
    this.root.querySelectorAll(".thumb").forEach((t, k) => t.classList.toggle("is-active", k === this.frame));
    this.root.querySelector(".thumb.is-active")?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    this.draw();
    this.onFrameChange(this.frame);
  }

  toggle() { this.playing ? this.pause() : this.play(); }
  play() {
    if (this.n < 2) return;
    this.playing = true;
    this.$("[data-v=play]").innerHTML = PAUSE_ICON;
    this.$("[data-v=play]").setAttribute("aria-label", "Pause");
    let last = performance.now();
    const tick = (now) => {
      if (!this.playing) return;
      const interval = 1000 / (CONFIG.viewer.baseFps * this.speed);
      if (now - last >= interval) { last = now; this.go(this.frame + 1); }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    const b = this.$("[data-v=play]");
    if (b) { b.innerHTML = PLAY_ICON; b.setAttribute("aria-label", "Play"); }
  }

  select(id) { this.selected = id; this.draw(); this.onSelect(id); }

  imageSize() {
    const it = this.items?.[this.frame];
    return this.result?.imageSize || it?.dims || { w: 1024, h: 1024 };
  }

  /* ---------- drawing ---------- */
  draw() {
    if (!this.items?.length) return;
    const wrap = this.canvas.parentElement;
    const { w: iw, h: ih } = this.imageSize();
    const dpr = window.devicePixelRatio || 1;
    const cssW = wrap.clientWidth;
    const cssH = Math.min(cssW * (ih / iw), window.innerHeight * 0.72);
    const dispW = cssH / (ih / iw);
    this.canvas.style.width = `${dispW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(dispW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.scale = (dispW * dpr) / iw;
    this.renderTo(this.ctx, this.canvas.width, this.canvas.height, this.frame, { dpr });
    const note = this.$("[data-v=note]");
    if (note) {
      const msg = {
        approx: "Positions are on the API's registered 1024×1024 crop. This frame is a centre crop of your raw upload, which isn't registered, so markers are approximate.",
        none: "This frame has no browser preview (e.g. compressed .fits.fz). Detections are drawn on the 1024×1024 coordinate grid.",
      }[this.baseKind];
      note.hidden = !msg;
      if (msg) note.textContent = msg;
    }
  }

  /** Shared by on-screen drawing and PNG export. */
  renderTo(ctx, W, H, frame, { dpr = 1, forceOverlay = false } = {}) {
    const { w: iw } = this.imageSize();
    const s = W / iw;
    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingQuality = "high";
    const ann = this.annotated[frame];
    const useAnn = !forceOverlay && this.mode === "annotated" && ann?.complete && ann.naturalWidth;
    this.baseKind = "raw";
    if (useAnn) {
      ctx.drawImage(ann, 0, 0, W, H);
      this.baseKind = "annotated";
      return; // the API already drew its own annotations
    }
    const reg = this.registered[frame];
    if (reg?.complete && reg.naturalWidth) {
      ctx.drawImage(reg, 0, 0, W, H);           // exact: same 1024x1024 grid the coordinates use
      this.baseKind = "registered";
    } else {
      const it = this.items[frame];
      const base = it.drawable;
      const crop = base ? this._centerCrop(it, base) : null;
      if (base && crop) { ctx.drawImage(base, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H); this.baseKind = "approx"; }
      else if (base) ctx.drawImage(base, 0, 0, W, H);
      else { this._placeholder(ctx, W, H); this.baseKind = "none"; }
    }

    const C = CONFIG.viewer.colors;
    const u = dpr * Math.max(0.8, Math.min(1.6, W / dpr / 640)); // UI unit
    const r = this.result;
    const P = (p) => [p.x * s, p.y * s];

    if (this.layers.traj) {
      r.detections.forEach((d) => {
        if (d.positions.length < 2) return;
        const sel = this.selected == null || this.selected === d.id;
        ctx.save();
        ctx.globalAlpha = sel ? 1 : 0.25;
        ctx.lineCap = "round";
        // full path (faint, dashed)
        ctx.setLineDash([4 * u, 5 * u]);
        ctx.strokeStyle = C.trajectory + "99";
        ctx.lineWidth = 1.4 * u;
        ctx.beginPath();
        d.positions.forEach((p, k) => { const [x, y] = P(p); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke();
        // travelled part (solid)
        ctx.setLineDash([]);
        ctx.strokeStyle = C.trajectory;
        ctx.lineWidth = (this.selected === d.id ? 2.6 : 1.8) * u;
        ctx.beginPath();
        let started = false;
        d.positions.filter((p) => p.frame <= frame).forEach((p) => { const [x, y] = P(p); started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true; });
        ctx.stroke();
        d.positions.forEach((p) => {
          const [x, y] = P(p);
          ctx.fillStyle = p.frame <= frame ? C.trajectory : C.trajectory + "66";
          ctx.beginPath(); ctx.arc(x, y, 2.2 * u, 0, Math.PI * 2); ctx.fill();
        });
        ctx.restore();
      });
    }

    if (this.layers.gt) {
      r.groundTruth.forEach((g) => {
        const p = g.positions.find((q) => q.frame === frame);
        if (!p) return;
        const [x, y] = P(p);
        ctx.strokeStyle = C.groundTruth;
        ctx.lineWidth = 2 * u;
        ctx.beginPath(); ctx.arc(x, y, 11 * u, 0, Math.PI * 2); ctx.stroke();
      });
    }

    if (this.layers.pred) {
      r.detections.forEach((d) => {
        const p = d.positions.find((q) => q.frame === frame);
        if (!p) return;
        const [x, y] = P(p);
        const sel = this.selected === d.id || this.hoverId === d.id;
        const k = (sel ? 9 : 7) * u;
        ctx.save();
        ctx.globalAlpha = this.selected == null || this.selected === d.id ? 1 : 0.35;
        ctx.strokeStyle = "rgba(0,0,0,.65)";
        ctx.lineWidth = 4.2 * u;
        cross(ctx, x, y, k);
        ctx.strokeStyle = C.prediction;
        ctx.lineWidth = 2.2 * u;
        cross(ctx, x, y, k);
        if (this.layers.labels) {
          const txt = `#${d.id}${d.confidence != null ? "  " + d.confidence.toFixed(2) : ""}`;
          ctx.font = `600 ${11 * u}px "JetBrains Mono", ui-monospace, monospace`;
          const tw = ctx.measureText(txt).width;
          const lx = Math.min(x + 12 * u, W - tw - 10 * u), ly = Math.max(y - 12 * u, 16 * u);
          ctx.fillStyle = "rgba(10,12,22,.78)";
          roundRect(ctx, lx - 5 * u, ly - 12 * u, tw + 10 * u, 17 * u, 4 * u); ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.fillText(txt, lx, ly);
        }
        ctx.restore();
      });
    }
  }

  /** The API reports positions on its registered reference crop (e.g. 1024x1024). When the uploaded
   *  frame is larger and the API sent no registered crops, show the same-sized centre crop of the raw
   *  frame so markers land roughly where they belong. */
  _centerCrop(it, base) {
    const { w: iw, h: ih } = this.imageSize();
    const d = it.dims;
    if (!d || (d.w === iw && d.h === ih) || d.w < iw || d.h < ih) return null;
    const s = (base.width || base.naturalWidth) / d.w; // preview downscale factor
    return { sx: ((d.w - iw) / 2) * s, sy: ((d.h - ih) / 2) * s, sw: iw * s, sh: ih * s };
  }

  _placeholder(ctx, W, H) {
    ctx.fillStyle = "#0b0e1c"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(120,130,180,.18)"; ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath(); ctx.moveTo((W * i) / 8, 0); ctx.lineTo((W * i) / 8, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (H * i) / 8); ctx.lineTo(W, (H * i) / 8); ctx.stroke();
    }
  }

  _hover(e) {
    const rect = this.canvas.getBoundingClientRect();
    const { w: iw, h: ih } = this.imageSize();
    const x = ((e.clientX - rect.left) / rect.width) * iw;
    const y = ((e.clientY - rect.top) / rect.height) * ih;
    let near = null, best = Infinity;
    const tol = (14 / rect.width) * iw;
    this.result.detections.forEach((d) => {
      const p = d.positions.find((q) => q.frame === this.frame);
      if (!p) return;
      const dist = Math.hypot(p.x - x, p.y - y);
      if (dist < tol && dist < best) { best = dist; near = d; }
    });
    const prev = this.hoverId;
    this.hoverId = near?.id ?? null;
    this.canvas.style.cursor = near ? "pointer" : "crosshair";
    const np = near?.positions.find((q) => q.frame === this.frame);
    this.$("[data-v=readout]").innerHTML = near
      ? `<b>Track #${near.id}</b> · conf ${near.confidence?.toFixed(3) ?? "—"} · x ${np.x.toFixed(1)} · y ${np.y.toFixed(1)} px`
      : `x ${x.toFixed(1)} · y ${y.toFixed(1)} px`;
    if (prev !== this.hoverId) this.draw();
  }

  /** Render a frame at native image resolution (capped) for download. */
  async frameBlob(frame, { overlays = true } = {}) {
    const { w: iw, h: ih } = this.imageSize();
    const scale = Math.min(1, 2048 / Math.max(iw, ih));
    const c = document.createElement("canvas");
    c.width = Math.round(iw * scale); c.height = Math.round(ih * scale);
    const ctx = c.getContext("2d");
    if (overlays) this.renderTo(ctx, c.width, c.height, frame, { dpr: Math.max(1, c.width / 900), forceOverlay: true });
    else ctx.drawImage(this.items[frame].drawable, 0, 0, c.width, c.height);
    return new Promise((r) => c.toBlob(r, "image/png"));
  }
}

function cross(ctx, x, y, k) {
  ctx.beginPath();
  ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k);
  ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k);
  ctx.stroke();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

const PLAY_ICON = `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>`;
export { PLAY_ICON };
