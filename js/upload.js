/* upload.js — ordered frame list: add / preview / reorder / remove */
import { CONFIG } from "./config.js";
import { readFits, fitsToCanvas, fitsTime } from "./fits.js";

let uid = 0;
const fmtBytes = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const extOf = (name) => (name.match(/\.[^.]+$/)?.[0] || "").toLowerCase();
// matches multi-part extensions such as ".fits.fz"
const accepts = (name) => CONFIG.upload.extensions.some((e) => name.toLowerCase().endsWith(e.toLowerCase()));
const NO_PREVIEW_THUMB = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#10132a"/>' +
  '<g fill="#5a6290"><circle cx="22" cy="30" r="1.6"/><circle cx="70" cy="22" r="1.2"/><circle cx="58" cy="74" r="1.8"/><circle cx="30" cy="68" r="1"/><circle cx="84" cy="56" r="1.3"/></g>' +
  '<text x="50" y="54" fill="#8a90b8" font-family="monospace" font-size="9" text-anchor="middle">no preview</text></svg>');

export class UploadManager {
  constructor({ dropzone, input, list, onChange, onError }) {
    this.items = [];
    this.list = list;
    this.onChange = onChange || (() => {});
    this.onError = onError || (() => {});
    this.dragId = null;

    input.addEventListener("change", () => { this.addFiles([...input.files]); input.value = ""; });
    ["dragenter", "dragover"].forEach((ev) =>
      dropzone.addEventListener(ev, (e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); dropzone.classList.add("is-over"); } })
    );
    ["dragleave", "drop"].forEach((ev) => dropzone.addEventListener(ev, () => dropzone.classList.remove("is-over")));
    dropzone.addEventListener("drop", (e) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      this.addFiles([...e.dataTransfer.files]);
    });
    dropzone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    dropzone.addEventListener("click", (e) => { if (e.target === dropzone || e.target.closest(".dz-inner")) input.click(); });
  }

  get ready() { return this.items.filter((i) => i.status === "ready"); }

  async addFiles(files) {
    const allowed = CONFIG.upload.extensions;
    const rejected = files.filter((f) => !accepts(f.name));
    if (rejected.length) this.onError(`Skipped ${rejected.length} file(s): only ${allowed.join(", ")} are accepted.`);
    let accepted = files.filter((f) => accepts(f.name));
    const room = CONFIG.upload.maxFiles - this.items.length;
    if (accepted.length > room) {
      this.onError(`At most ${CONFIG.upload.maxFiles} frames per run, so the last ${accepted.length - room} were skipped.`);
      accepted = accepted.slice(0, Math.max(0, room));
    }
    const newItems = accepted.map((file) => ({
      id: ++uid, file, name: file.name, size: file.size,
      kind: file.name.toLowerCase().endsWith(".png") ? "png" : "fits",
      status: "loading", drawable: null, thumb: null, dims: null, time: null, error: null,
    }));
    this.items.push(...newItems);
    this.render();
    for (const it of newItems) {
      await new Promise((r) => setTimeout(r, 0)); // let the UI breathe between big files
      try { await this.loadPreview(it); it.status = "ready"; }
      catch (err) {
        // A preview failure (e.g. tile-compressed .fits.fz) must not block the run:
        // the API receives the original file untouched.
        if (it.kind === "fits") { it.status = "ready"; it.noPreview = true; it.thumb = NO_PREVIEW_THUMB; it.note = "no browser preview, will still be sent"; }
        else { it.status = "error"; it.error = err.message || String(err); }
      }
      this.render();
    }
  }

  async loadPreview(it) {
    if (it.kind === "png") {
      const url = URL.createObjectURL(it.file);
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      it.drawable = img;
      it.dims = { w: img.naturalWidth, h: img.naturalHeight };
      it.thumb = url;
      it.time = it.file.lastModified || null;
      it.fullUrl = url;
    } else {
      const buf = await it.file.arrayBuffer();
      const fits = readFits(buf);
      const canvas = fitsToCanvas(fits, { maxSide: CONFIG.upload.previewMaxSide, flipY: CONFIG.upload.fitsFlipY });
      it.drawable = canvas;
      it.dims = { w: fits.width, h: fits.height };
      it.thumb = canvas.toDataURL("image/jpeg", 0.8);
      it.time = fitsTime(fits.header);
      it.header = { "DATE-OBS": fits.header["DATE-OBS"], EXPTIME: fits.header.EXPTIME, FILTER: fits.header.FILTER, OBJECT: fits.header.OBJECT };
    }
  }

  move(id, delta) {
    const i = this.items.findIndex((x) => x.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= this.items.length) return;
    [this.items[i], this.items[j]] = [this.items[j], this.items[i]];
    this.render();
  }
  moveTo(id, targetId, after) {
    const from = this.items.findIndex((x) => x.id === id);
    if (from < 0 || id === targetId) return;
    const [it] = this.items.splice(from, 1);
    let to = this.items.findIndex((x) => x.id === targetId);
    if (after) to += 1;
    this.items.splice(to, 0, it);
    this.render();
  }
  remove(id) {
    const it = this.items.find((x) => x.id === id);
    if (it?.fullUrl) URL.revokeObjectURL(it.fullUrl);
    this.items = this.items.filter((x) => x.id !== id);
    this.render();
  }
  clear() { [...this.items].forEach((x) => this.remove(x.id)); }
  sortByName() {
    const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    this.items.sort((a, b) => coll.compare(a.name, b.name));
    this.render();
  }
  sortByTime() {
    const missing = this.items.filter((i) => i.time == null).length;
    this.items.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
    if (missing) this.onError(`${missing} frame(s) have no timestamp (DATE-OBS / MJD-OBS) and were placed last.`);
    this.render();
  }

  render() {
    const ul = this.list;
    ul.innerHTML = "";
    this.items.forEach((it, idx) => {
      const li = document.createElement("li");
      li.className = `frame-card is-${it.status}`;
      li.draggable = true;
      li.dataset.id = it.id;
      const dims = it.dims ? `${it.dims.w}×${it.dims.h}` : it.status === "loading" ? "reading…" : "";
      li.innerHTML = `
        <div class="fc-thumb">
          ${it.thumb ? `<img src="${it.thumb}" alt="" draggable="false">` : `<div class="fc-ph">${it.status === "error" ? "!" : ""}</div>`}
          <span class="fc-badge">t${idx}</span>
          <span class="fc-kind">${it.kind.toUpperCase()}</span>
        </div>
        <div class="fc-meta">
          <div class="fc-name" title="${escapeHtml(it.name)}">${escapeHtml(it.name)}</div>
          <div class="fc-sub">${it.status === "error" ? `<span class="err">${escapeHtml(it.error)}</span>` : `${fmtBytes(it.size)}${dims ? " · " + dims : ""}${it.note ? ` · <span class="note-txt">${escapeHtml(it.note)}</span>` : ""}`}</div>
        </div>
        <div class="fc-actions">
          <button class="icon-btn" data-act="left" aria-label="Move earlier" ${idx === 0 ? "disabled" : ""}>‹</button>
          <button class="icon-btn" data-act="right" aria-label="Move later" ${idx === this.items.length - 1 ? "disabled" : ""}>›</button>
          <button class="icon-btn danger" data-act="remove" aria-label="Remove frame">×</button>
        </div>`;
      li.addEventListener("click", (e) => {
        const act = e.target.closest("button")?.dataset.act;
        if (act === "left") this.move(it.id, -1);
        if (act === "right") this.move(it.id, +1);
        if (act === "remove") this.remove(it.id);
      });
      li.addEventListener("dragstart", (e) => { this.dragId = it.id; li.classList.add("is-dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(it.id)); });
      li.addEventListener("dragend", () => { this.dragId = null; li.classList.remove("is-dragging"); ul.querySelectorAll(".drop-before,.drop-after").forEach((n) => n.classList.remove("drop-before", "drop-after")); });
      li.addEventListener("dragover", (e) => {
        if (this.dragId == null) return;
        e.preventDefault();
        const r = li.getBoundingClientRect();
        const after = e.clientX > r.left + r.width / 2;
        li.classList.toggle("drop-after", after); li.classList.toggle("drop-before", !after);
      });
      li.addEventListener("dragleave", () => li.classList.remove("drop-before", "drop-after"));
      li.addEventListener("drop", (e) => {
        if (this.dragId == null) return;
        e.preventDefault(); e.stopPropagation();
        const r = li.getBoundingClientRect();
        this.moveTo(this.dragId, it.id, e.clientX > r.left + r.width / 2);
      });
      ul.appendChild(li);
    });
    this.onChange(this.items);
  }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
