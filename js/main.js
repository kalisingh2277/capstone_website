/* main.js — wires pages, router and the detection workflow together */
import { CONFIG, isDemoMode } from "./config.js";
import { UploadManager, escapeHtml } from "./upload.js";
import { runDetection } from "./api.js";
import { normalizeResponse } from "./adapter.js";
import { FrameViewer, PLAY_ICON } from "./viewer.js";
import { renderMetrics, renderDetectionTable, renderTrajectoryPlot, renderCoordTable, highlightSelection, markFrameOnPlot, markFrameOnTable } from "./results.js";
import { saveBlob, jsonBlob, coordsCsv, apiFrameBlob, makeZip } from "./downloads.js";
import { generateSampleTracklet } from "./mock.js";
import { mountDoodles } from "./doodles.js";
import { renderArchitecture } from "./architecture.js";
import { lineChart, barChart, SERIES } from "./charts.js";
import { DETECTION, DETECTION_COMBINED, LOCALIZATION, LOCALIZATION_COMBINED, EVAL_SETTINGS, TRAINING, DATASET } from "./paperdata.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg, kind = "info") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), 4200);
}

/* ---------------- router ---------------- */
const ROUTES = ["home", "detect", "methodology", "dataset", "results", "paper"];
const inited = new Set();
function route() {
  const name = ROUTES.includes(location.hash.slice(1)) ? location.hash.slice(1) : "home";
  $$(".page").forEach((p) => (p.hidden = p.dataset.page !== name));
  $$("#nav a").forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${name}`));
  $("#nav").classList.remove("open");
  if (!inited.has(name)) { inited.add(name); PAGE_INIT[name]?.(); }
  window.scrollTo({ top: 0 });
}

/* ---------------- detect page ---------------- */
let upload, viewer, lastResult = null, lastItems = [], running = null;

function initDetect() {
  const demo = isDemoMode();
  $("#apiStatus").innerHTML = demo
    ? `<span class="dot dot-demo"></span><b>Demo mode</b> — no API URL set in <code>js/config.js</code>, results are simulated in the browser.`
    : `<span class="dot dot-live"></span>Connected to <code>${escapeHtml(CONFIG.api.url)}</code>`;

  upload = new UploadManager({
    dropzone: $("#dropzone"), input: $("#fileInput"), list: $("#frameList"),
    onChange: updateRunState, onError: (m) => toast(m, "warn"),
  });
  $("#fileInput").accept = CONFIG.upload.extensions.map((e) => e.split(".").pop()).map((e) => "." + e).join(",");
  $("#dzTypes").textContent = `${CONFIG.upload.extensions.join(" · ")}: ${CONFIG.upload.minFiles} or more frames of the same field, any order (reorder below)`;
  $("#sampleLine").hidden = !demo;                 // the synthetic sample is PNG, only for demo mode
  $("#ccdRow").hidden = demo || !CONFIG.api.ccdField;
  $("#runHint").textContent = `Add at least ${CONFIG.upload.minFiles} frames to run detection.`;
  $("#btnSortName").addEventListener("click", () => upload.sortByName());
  $("#btnSortTime").addEventListener("click", () => upload.sortByTime());
  $("#btnClear").addEventListener("click", () => upload.clear());
  $("#btnSample").addEventListener("click", async (e) => {
    const b = e.currentTarget; b.disabled = true; b.textContent = "Generating…";
    try { upload.addFiles(await generateSampleTracklet({ frames: 5 })); toast("Added a 5-frame synthetic tracklet with 2 injected movers."); }
    finally { b.disabled = false; b.textContent = "Load sample tracklet"; }
  });
  $("#btnRun").addEventListener("click", run);
  $("#btnCancel").addEventListener("click", () => running?.abort());

  viewer = new FrameViewer($("#viewer"));
  $("#viewer [data-v=play]").innerHTML = PLAY_ICON;
  viewer.onFrameChange = (f) => { markFrameOnPlot($("#trajPlot"), f); markFrameOnTable($("#coordTable"), f); };
  viewer.onSelect = (id) => highlightSelection($("#page-detect"), id);

  $("#dlJson").addEventListener("click", () => lastResult && saveBlob(jsonBlob(lastResult.raw), "detection_results.json"));
  $("#dlCsv").addEventListener("click", () => lastResult && saveBlob(coordsCsv(lastResult), "trajectories.csv"));
  $("#dlFrame").addEventListener("click", downloadCurrentFrame);
  $("#dlZip").addEventListener("click", downloadZip);
  updateRunState(upload.items);
}

function updateRunState(items) {
  const ready = items.filter((i) => i.status === "ready").length;
  const loading = items.some((i) => i.status === "loading");
  const min = CONFIG.upload.minFiles;
  const btn = $("#btnRun");
  btn.disabled = !!running || loading || ready < min;
  $("#frameCount").textContent = items.length ? `${items.length} frame${items.length > 1 ? "s" : ""} in sequence` : "No frames yet";
  $("#runHint").textContent = loading ? "Reading files…" : ready < min ? `Add at least ${min} frames to run detection.` : `Ready: ${ready} frames will be sent in this order (t0 → t${ready - 1}).`;
  $("#seqTools").hidden = !items.length;
  $("#frameList").hidden = !items.length;
}

async function run() {
  const items = upload.ready;
  if (items.length < CONFIG.upload.minFiles) return;
  const ctrl = new AbortController();
  running = ctrl;
  updateRunState(upload.items);
  $("#runBox").classList.add("is-running");
  $("#btnCancel").hidden = false;
  const started = performance.now();
  const tick = setInterval(() => ($("#runTimer").textContent = `${((performance.now() - started) / 1000).toFixed(1)} s`), 100);
  $("#runStatus").textContent = isDemoMode() ? "Running demo detector…" : `Sending ${items.length} frames to the API…`;
  try {
    const extra = {};
    if (CONFIG.api.ccdField && $("#ccdInput")) extra[CONFIG.api.ccdField] = $("#ccdInput").value;
    const { raw, roundTripMs } = await runDetection(items, { signal: ctrl.signal, extra });
    const dims = items[0].dims;
    const result = normalizeResponse(raw, {
      nFrames: items.length, roundTripMs, uploadDims: dims,
      coordinateSpace: isDemoMode() ? null : CONFIG.coordinateSpace,
    });
    lastResult = result; lastItems = [...items];
    showResults(result, items);
    toast(`Done: ${result.detections.length} moving source${result.detections.length === 1 ? "" : "s"} found.`, "ok");
  } catch (err) {
    if (err.message === "cancelled" || err.message === "Request cancelled.") toast("Detection cancelled.");
    else showError(err);
  } finally {
    clearInterval(tick);
    running = null;
    $("#runBox").classList.remove("is-running");
    $("#btnCancel").hidden = true;
    $("#runStatus").textContent = "";
    $("#runTimer").textContent = "";
    updateRunState(upload.items);
  }
}

function showError(err) {
  const box = $("#errorBox");
  box.hidden = false;
  box.innerHTML = `<b>Detection failed.</b> ${escapeHtml(err.message)}${err.detail ? `<details><summary>Details</summary><pre>${escapeHtml(typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail, null, 2))}</pre></details>` : ""}`;
  box.scrollIntoView({ behavior: "smooth", block: "center" });
}

function showResults(r, items) {
  $("#errorBox").hidden = true;
  $("#resultsEmpty").hidden = true;
  $("#results").hidden = false;
  const pick = (f) => { viewer.pause(); viewer.go(f); };
  viewer.load(r, items);
  renderMetrics($("#metrics"), r);
  renderDetectionTable($("#detTableWrap"), r, { onSelect: (id) => viewer.select(id) });
  renderTrajectoryPlot($("#trajPlot"), r, { onPickFrame: pick });
  renderCoordTable($("#coordTable"), r, { onPickFrame: pick });
  markFrameOnPlot($("#trajPlot"), viewer.frame);
  markFrameOnTable($("#coordTable"), viewer.frame);
  $("#rawJson").textContent = JSON.stringify(r.raw, (k, v) => (typeof v === "string" && v.length > 300 ? v.slice(0, 120) + `… (${v.length} chars)` : v), 2);
  const apiDl = $("#dlApi");
  apiDl.hidden = !r.downloadUrl;
  if (r.downloadUrl) apiDl.href = r.downloadUrl;
  $("#dlFrameLabel").textContent = r.annotatedFrames.some(Boolean) ? "Current frame (API annotated)" : "Current frame (annotated PNG)";
  requestAnimationFrame(() => $("#results").scrollIntoView({ behavior: "smooth", block: "start" }));
}

async function frameBlobFor(i) {
  const apiSrc = lastResult.annotatedFrames[i];
  return (apiSrc && (await apiFrameBlob(apiSrc))) || viewer.frameBlob(i, { overlays: true });
}

async function downloadCurrentFrame() {
  if (!lastResult) return;
  const i = viewer.frame;
  saveBlob(await frameBlobFor(i), `annotated_t${String(i).padStart(2, "0")}.png`);
}

async function downloadZip(e) {
  if (!lastResult) return;
  const b = e.currentTarget; const label = b.innerHTML;
  b.disabled = true; b.textContent = "Packing…";
  try {
    const entries = [
      { name: "detection_results.json", blob: jsonBlob(lastResult.raw) },
      { name: "trajectories.csv", blob: coordsCsv(lastResult) },
    ];
    for (let i = 0; i < lastItems.length; i++) entries.push({ name: `annotated/annotated_t${String(i).padStart(2, "0")}.png`, blob: await frameBlobFor(i) });
    saveBlob(await makeZip(entries), `asteroid_detection_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.zip`);
  } finally { b.disabled = false; b.innerHTML = label; }
}

/* ---------------- static pages ---------------- */
const labels = DETECTION.map((d) => String(d.n));
const cell = (v, d = 4) => (typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(d)) : v);

function initResults() {
  lineChart($("#chartPRF"), {
    labels, xTitle: "Simultaneous injections", yMin: 0.8, yMax: 1.0, yStep: 0.05,
    series: [
      { name: "Precision", color: SERIES.blue, values: DETECTION.map((d) => d.precision) },
      { name: "Recall", color: SERIES.coral, values: DETECTION.map((d) => d.recall) },
      { name: "F1-score", color: SERIES.teal, values: DETECTION.map((d) => d.f1) },
    ],
  });
  barChart($("#chartAcc"), { labels, values: DETECTION.map((d) => d.accuracy), color: SERIES.blue, yMax: 1, yStep: 0.25, yFmt: (v) => v.toFixed(2), xTitle: "Simultaneous injections", name: "Exact-set accuracy" });
  barChart($("#chartLoc"), { labels, values: LOCALIZATION.map((d) => d.locErr), color: SERIES.teal, yMax: 4, yStep: 1, yFmt: (v) => v.toFixed(0), xTitle: "Simultaneous injections", name: "Median localisation error (px)", valueFmt: (v) => v.toFixed(2) + " px" });
  barChart($("#chartVel"), { labels, values: LOCALIZATION.map((d) => d.velErr), color: SERIES.coral, yMax: 4, yStep: 1, yFmt: (v) => v.toFixed(0), xTitle: "Simultaneous injections", name: "Median velocity error (px/frame)", valueFmt: (v) => v.toFixed(2) });

  $("#tableDetection").innerHTML = `<thead><tr><th>Scenario</th><th class="num">TP</th><th class="num">FP</th><th class="num">FN</th><th class="num">Precision</th><th class="num">Recall</th><th class="num">F1</th><th class="num">Accuracy</th></tr></thead>
    <tbody>${[...DETECTION, DETECTION_COMBINED].map((d) => `<tr class="${d.scenario === "Combined" ? "total" : ""}"><td>${d.scenario}</td><td class="num">${d.tp}</td><td class="num">${d.fp}</td><td class="num">${d.fn}</td><td class="num">${cell(d.precision)}</td><td class="num">${cell(d.recall)}</td><td class="num">${cell(d.f1)}</td><td class="num">${d.scenario === "Combined" ? cell(d.accuracy, 3) : cell(d.accuracy, 2)}</td></tr>`).join("")}</tbody>`;
  $("#tableLoc").innerHTML = `<thead><tr><th>Scenario</th><th class="num">Matched</th><th class="num">Median loc. error (px)</th><th class="num">Median vel. error (px/frame)</th></tr></thead>
    <tbody>${[...LOCALIZATION, { scenario: "Combined", ...LOCALIZATION_COMBINED }].map((d) => `<tr class="${d.scenario === "Combined" ? "total" : ""}"><td>${d.scenario}</td><td class="num">${d.matched}</td><td class="num">${d.locErr.toFixed(3)}</td><td class="num">${d.velErr.toFixed(3)}</td></tr>`).join("")}</tbody>`;
  $("#evalSettings").innerHTML = EVAL_SETTINGS.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
}

function initMethodology() {
  renderArchitecture($("#archDiagram"), $("#archDetail"));
  $("#trainTable").innerHTML = TRAINING.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");
}

function initDataset() {
  $("#splitBar").innerHTML = DATASET.split.map((s, i) => `<div class="split-seg s${i}" style="flex:${s.pct}"><b>${s.pct}%</b><span>${s.name}</span></div>`).join("");
}

function initPaper() {
  if (CONFIG.paper.pdfUrl) $("#pdfLink").href = CONFIG.paper.pdfUrl; else $("#pdfLink").hidden = true;
  $("#btnCopyBib").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#bibtex").textContent); toast("BibTeX copied.", "ok"); }
    catch { toast("Couldn't copy here; select the text and copy it manually.", "warn"); }
  });
}

const PAGE_INIT = { detect: initDetect, results: initResults, methodology: initMethodology, dataset: initDataset, paper: initPaper };

/* ---------------- theme ---------------- */
function setTheme(t, save) {
  document.documentElement.dataset.theme = t;
  const b = $("#themeToggle");
  b.setAttribute("aria-label", t === "dark" ? "Switch to light mode" : "Switch to dark mode");
  if (save) { try { localStorage.setItem("fm-theme", t); } catch {} }
  viewer?.draw();
}
$("#themeToggle").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true));
setTheme(document.documentElement.dataset.theme || "light", false);

/* ---------------- boot ---------------- */
mountDoodles($("#doodles"));
$(".nav-toggle").addEventListener("click", () => $("#nav").classList.toggle("open"));
$("#modePill").hidden = !isDemoMode();
window.addEventListener("hashchange", route);
route();
