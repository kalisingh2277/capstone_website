/* results.js — metrics panel, detection table, trajectory plot, coordinates */
import { escapeHtml } from "./upload.js";
import { CONFIG } from "./config.js";
const CONFIG_METRICS_PATH = () => CONFIG.responseMap.metrics || "";

const f = (v, d = 1) => (v == null || !Number.isFinite(+v) ? "—" : (+v).toFixed(d));
const human = (k) => k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function renderMetrics(el, r) {
  const confs = r.detections.map((d) => d.confidence).filter((c) => c != null);
  const speeds = r.detections.map((d) => d.speed).filter((s) => s != null);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const proc = r.processingTimeMs ?? r.roundTripMs;
  const tiles = [
    { label: "Detected objects", value: r.detections.length, unit: r.detections.length === 1 ? "track" : "tracks", big: true },
    { label: "Mean confidence", value: confs.length ? f(mean(confs), 3) : "—", sub: confs.length ? `max ${f(Math.max(...confs), 3)} · min ${f(Math.min(...confs), 3)}` : "not returned" },
    { label: r.processingTimeMs != null ? "Processing time" : "Round-trip time", value: proc != null ? (proc >= 1000 ? f(proc / 1000, 2) : Math.round(proc)) : "—", unit: proc >= 1000 ? "s" : "ms",
      sub: r.processingTimeMs != null && r.roundTripMs != null ? `round-trip ${Math.round(r.roundTripMs)} ms` : r.processingTimeMs == null ? "measured in browser" : "" },
    { label: "Frames analysed", value: r.nFrames, sub: `reference frame t${r.referenceFrame}` },
    { label: "Mean apparent motion", value: speeds.length ? f(mean(speeds), 1) : "—", unit: "px / frame", sub: "registered image coords" },
    { label: "Image grid", value: r.imageSize ? `${r.imageSize.w}<span class="m-x">×</span>${r.imageSize.h}` : "—", unit: "px", small: true },
  ];
  const secs = /timing|seconds|_s$/i.test(String(CONFIG_METRICS_PATH()));
  const extra = Object.entries(r.metrics || {}).filter(([, v]) => v != null && typeof v !== "object")
    .map(([k, v]) => [secs && typeof v === "number" ? `${k} (s)` : k, v]);
  el.innerHTML = `
    ${r.message ? `<p class="api-msg">${escapeHtml(r.message)}</p>` : ""}
    <div class="metric-grid">
      ${tiles.map((t) => `
        <div class="metric ${t.big ? "metric-big" : ""} ${t.small ? "metric-small" : ""}">
          <div class="m-label">${t.label}</div>
          <div class="m-value">${t.value}${t.unit ? `<span class="m-unit">${t.unit}</span>` : ""}</div>
          ${t.sub ? `<div class="m-sub">${t.sub}</div>` : ""}
        </div>`).join("")}
    </div>
    ${extra.length ? `
      <h4 class="mini-h">Reported by the API</h4>
      <dl class="kv">${extra.map(([k, v]) => `<dt>${escapeHtml(human(k).replace(/\(S\)$/, "(s)"))}</dt><dd>${escapeHtml(typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(4)) : v)}</dd>`).join("")}</dl>` : ""}`;
}

export function renderDetectionTable(el, r, { onSelect }) {
  if (!r.detections.length) {
    el.innerHTML = `<div class="empty-note">No moving sources above the confidence threshold in this sequence.</div>`;
    return;
  }
  el.innerHTML = `
  <div class="table-wrap"><table class="data-table" id="detTable">
    <thead><tr><th>Track</th><th>Confidence</th><th class="num">x<sub>ref</sub></th><th class="num">y<sub>ref</sub></th><th class="num">v<sub>x</sub></th><th class="num">v<sub>y</sub></th><th class="num">|v| px/fr</th><th class="num">Frames</th></tr></thead>
    <tbody>${r.detections.map((d) => {
      const ref = d.positions.find((p) => p.frame === r.referenceFrame) || d.positions[0] || {};
      const c = d.confidence;
      return `<tr data-id="${escapeHtml(d.id)}" tabindex="0">
        <td><span class="track-dot"></span>#${escapeHtml(d.id)}${d.label ? ` <small>${escapeHtml(d.label)}</small>` : ""}</td>
        <td><div class="conf"><div class="conf-bar"><i style="width:${c != null ? c * 100 : 0}%"></i></div><span>${f(c, 3)}</span></div></td>
        <td class="num">${f(ref.x)}</td><td class="num">${f(ref.y)}</td>
        <td class="num">${f(d.velocity?.vx, 2)}</td><td class="num">${f(d.velocity?.vy, 2)}</td>
        <td class="num">${f(d.speed, 2)}</td><td class="num">${d.positions.length}</td></tr>`;
    }).join("")}</tbody></table></div>`;
  el.querySelectorAll("tbody tr").forEach((tr) => {
    const go = () => {
      const det = r.detections.find((d) => String(d.id) === tr.dataset.id);
      onSelect(tr.classList.contains("is-selected") ? null : det.id);
    };
    tr.addEventListener("click", go);
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  });
}

export function highlightSelection(root, id) {
  root.querySelectorAll("#detTable tbody tr").forEach((tr) => tr.classList.toggle("is-selected", id != null && tr.dataset.id === String(id)));
  root.querySelectorAll(".traj-track").forEach((g) => {
    g.classList.toggle("is-selected", id != null && g.dataset.id === String(id));
    g.classList.toggle("is-dim", id != null && g.dataset.id !== String(id));
  });
}

export function renderTrajectoryPlot(el, r, { onPickFrame }) {
  const W = r.imageSize?.w || 1024, H = r.imageSize?.h || 1024;
  const pad = Math.max(W, H) * 0.04;
  const fs = Math.max(W, H) / 38;
  const sw = Math.max(W, H) / 380;
  const grid = [];
  for (let i = 1; i < 4; i++) {
    grid.push(`<line x1="${(W * i) / 4}" y1="0" x2="${(W * i) / 4}" y2="${H}"/>`, `<line x1="0" y1="${(H * i) / 4}" x2="${W}" y2="${(H * i) / 4}"/>`);
  }
  const tracks = r.detections.map((d) => {
    const pts = d.positions.map((p) => `${p.x},${p.y}`).join(" ");
    const last = d.positions[d.positions.length - 1], first = d.positions[0];
    return `<g class="traj-track" data-id="${escapeHtml(d.id)}">
      <polyline points="${pts}" fill="none" stroke-width="${sw * 2.2}" marker-end="url(#arrowHead)"/>
      ${d.positions.map((p) => `<circle class="pt" data-frame="${p.frame}" cx="${p.x}" cy="${p.y}" r="${sw * 4}"><title>Track #${escapeHtml(d.id)} · t${p.frame}\nx ${f(p.x, 2)}, y ${f(p.y, 2)}</title></circle>`).join("")}
      ${first ? `<text x="${first.x + sw * 6}" y="${first.y - sw * 6}" font-size="${fs}">#${escapeHtml(d.id)}</text>` : ""}
      ${last && last !== first ? `<text class="t-end" x="${last.x + sw * 6}" y="${last.y + fs}" font-size="${fs * 0.8}">t${last.frame}</text>` : ""}
    </g>`;
  }).join("");
  const gts = r.groundTruth.map((g) =>
    `<polyline class="traj-gt" points="${g.positions.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke-width="${sw * 1.4}" stroke-dasharray="${sw * 4} ${sw * 4}"/>`).join("");

  el.innerHTML = `
    <svg class="traj-svg" viewBox="${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}" role="img" aria-label="Detected trajectories across frames">
      <defs><marker id="arrowHead" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrow"/></marker></defs>
      <rect x="0" y="0" width="${W}" height="${H}" class="traj-bg" rx="${sw * 4}"/>
      <g class="traj-grid" stroke-width="${sw * 0.6}">${grid.join("")}</g>
      ${gts}
      ${tracks}
      <text class="traj-axis" x="0" y="${-pad * 0.3}" font-size="${fs * 0.75}">(0, 0)</text>
      <text class="traj-axis" x="${W}" y="${H + pad * 0.8}" font-size="${fs * 0.75}" text-anchor="end">(${W}, ${H}) px</text>
    </svg>
    <div class="legend-row">
      <span><i class="lg lg-track"></i>Predicted trajectory</span>
      <span><i class="lg lg-now"></i>Current frame</span>
      ${r.groundTruth.length ? `<span><i class="lg lg-gt"></i>Ground truth</span>` : ""}
    </div>`;
  el.querySelectorAll("circle.pt").forEach((c) => c.addEventListener("click", () => onPickFrame(+c.dataset.frame)));
}

export function markFrameOnPlot(el, frame) {
  el.querySelectorAll("circle.pt").forEach((c) => c.classList.toggle("is-now", +c.dataset.frame === frame));
}

export function renderCoordTable(el, r, { onPickFrame }) {
  if (!r.detections.length) { el.innerHTML = ""; return; }
  const head = r.detections.map((d) => `<th colspan="2" class="num">#${escapeHtml(d.id)}</th>`).join("");
  const sub = r.detections.map(() => `<th class="num">x</th><th class="num">y</th>`).join("");
  const rows = Array.from({ length: r.nFrames }, (_, t) => {
    const cells = r.detections.map((d) => {
      const p = d.positions.find((q) => q.frame === t);
      return `<td class="num">${p ? f(p.x, 2) : "—"}</td><td class="num">${p ? f(p.y, 2) : "—"}</td>`;
    }).join("");
    return `<tr data-frame="${t}"><td>t${t}${t === r.referenceFrame ? ' <small class="ref-tag">ref</small>' : ""}</td>${cells}</tr>`;
  }).join("");
  el.innerHTML = `<div class="table-wrap"><table class="data-table coord-table">
    <thead><tr><th rowspan="2">Frame</th>${head}</tr><tr>${sub}</tr></thead><tbody>${rows}</tbody></table></div>`;
  el.querySelectorAll("tbody tr").forEach((tr) => tr.addEventListener("click", () => onPickFrame(+tr.dataset.frame)));
}

export function markFrameOnTable(el, frame) {
  el.querySelectorAll("tbody tr").forEach((tr) => tr.classList.toggle("is-now", +tr.dataset.frame === frame));
}
