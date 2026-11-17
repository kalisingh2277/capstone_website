/* charts.js — small, dependency-free SVG charts with hover tooltips.
 * Palette validated for CVD separation (see README). */
// Colours live in CSS (--s-blue/--s-coral/--s-teal) so light and dark themes each use their own validated steps.
export const SERIES = { blue: "var(--s-blue)", coral: "var(--s-coral)", teal: "var(--s-teal)" };

const NS = "http://www.w3.org/2000/svg";
const fmt = (v, d) => (+v).toFixed(d);

function frame(el, { h = 300, m = { t: 18, r: 92, b: 40, l: 48 } } = {}) {
  const w = Math.max(260, Math.round(el.clientWidth || 560)); // draw at true pixel width so text stays 11–12px
  el.innerHTML = "";
  el.classList.add("chart");
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("role", "img");
  el.appendChild(svg);
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  el.appendChild(tip);
  return { svg, tip, w, h, m, iw: w - m.l - m.r, ih: h - m.t - m.b };
}

function axes(svg, { m, iw, ih }, x, y, yTicks, yFmt, xLabels, xTitle) {
  let s = `<g class="axis">`;
  yTicks.forEach((t) => {
    s += `<line class="grid" x1="${m.l}" x2="${m.l + iw}" y1="${y(t)}" y2="${y(t)}"/>`;
    s += `<text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${yFmt(t)}</text>`;
  });
  xLabels.forEach((lab, i) => { s += `<text x="${x(i)}" y="${m.t + ih + 18}" text-anchor="middle">${lab}</text>`; });
  if (xTitle) s += `<text class="axis-title" x="${m.l + iw / 2}" y="${m.t + ih + 36}" text-anchor="middle">${xTitle}</text>`;
  s += `<line class="baseline" x1="${m.l}" x2="${m.l + iw}" y1="${m.t + ih}" y2="${m.t + ih}"/></g>`;
  svg.insertAdjacentHTML("beforeend", s);
}

function showTip(tip, el, html, px, py) {
  tip.innerHTML = html;
  tip.style.opacity = 1;
  const r = el.getBoundingClientRect();
  const left = Math.min(Math.max(px, 70), r.width - 70);
  tip.style.left = `${left}px`;
  tip.style.top = `${py}px`;
}

/** Re-render a chart whenever its container width changes. */
function responsive(el, draw) {
  draw();
  let last = el.clientWidth, t;
  new ResizeObserver(() => {
    if (Math.abs(el.clientWidth - last) < 4) return;
    last = el.clientWidth; clearTimeout(t); t = setTimeout(draw, 120);
  }).observe(el);
}

/** Multi-series line chart: series = [{name, color, values}] */
export function lineChart(el, opts) { responsive(el, () => drawLine(el, opts)); }
function drawLine(el, { labels, series, yMin, yMax, yStep, yFmt = (v) => fmt(v, 2), xTitle, valueFmt = (v) => fmt(v, 4) }) {
  const F = frame(el, { h: 320 });
  const { svg, tip, m, iw, ih } = F;
  const x = (i) => m.l + (iw * i) / (labels.length - 1);
  const y = (v) => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const ticks = [];
  for (let t = yMin; t <= yMax + 1e-9; t += yStep) ticks.push(+t.toFixed(4));
  axes(svg, F, x, y, ticks, yFmt, labels, xTitle);
  svg.setAttribute("aria-label", `${series.map((s) => s.name).join(", ")} by ${xTitle}`);

  // de-collide end labels
  const ends = series.map((s) => ({ s, y: y(s.values[s.values.length - 1]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;

  let g = "";
  series.forEach((s) => {
    const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("");
    g += `<path d="${d}" fill="none" style="stroke:${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    s.values.forEach((v, i) => { g += `<circle cx="${x(i)}" cy="${y(v)}" r="4" style="fill:${s.color};stroke:var(--card)" stroke-width="2"/>`; });
  });
  ends.forEach(({ s, y: ly }) => {
    g += `<text class="direct-label" x="${m.l + iw + 10}" y="${ly + 4}"><tspan style="fill:${s.color}">●</tspan> ${s.name}</text>`;
  });
  g += `<line class="crosshair" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" opacity="0"/>`;
  svg.insertAdjacentHTML("beforeend", g);

  const cross = svg.querySelector(".crosshair");
  const hit = document.createElementNS(NS, "rect");
  Object.entries({ x: m.l - 20, y: m.t, width: iw + 40, height: ih, fill: "transparent" }).forEach(([k, v]) => hit.setAttribute(k, v));
  svg.appendChild(hit);
  hit.addEventListener("mousemove", (e) => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const i = Math.max(0, Math.min(labels.length - 1, Math.round(((p.x - m.l) / iw) * (labels.length - 1))));
    cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("opacity", 1);
    const scale = el.getBoundingClientRect().width / F.w;
    showTip(tip, el, `<b>${xTitle}: ${labels[i]}</b>${series.map((s) => `<div><i style="background:${s.color}"></i>${s.name}<span>${valueFmt(s.values[i])}</span></div>`).join("")}`, x(i) * scale, m.t * scale);
  });
  hit.addEventListener("mouseleave", () => { tip.style.opacity = 0; cross.setAttribute("opacity", 0); });
}

/** Single-series bar chart */
export function barChart(el, opts) { responsive(el, () => drawBar(el, opts)); }
function drawBar(el, { labels, values, color, yMax, yStep, yFmt = (v) => fmt(v, 1), xTitle, valueFmt = (v) => fmt(v, 2), name, h = 230 }) {
  const F = frame(el, { h, m: { t: 22, r: 14, b: 42, l: 40 } });
  const { svg, tip, m, iw, ih } = F;
  const band = iw / labels.length;
  const bw = Math.min(46, band * 0.56);
  const x = (i) => m.l + band * i + band / 2;
  const y = (v) => m.t + ih - (v / yMax) * ih;
  const ticks = [];
  for (let t = 0; t <= yMax + 1e-9; t += yStep) ticks.push(+t.toFixed(4));
  axes(svg, F, x, y, ticks, yFmt, labels, xTitle);
  svg.setAttribute("aria-label", `${name} by ${xTitle}`);
  let g = "";
  values.forEach((v, i) => {
    const top = y(v), bottom = m.t + ih, r = 4;
    const x0 = x(i) - bw / 2;
    g += `<path class="bar" data-i="${i}" style="fill:${color}" d="M${x0},${bottom} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${bottom} Z"/>`;
  });
  // label only first & last (selective direct labels)
  [0, values.length - 1].forEach((i) => { g += `<text class="bar-label" x="${x(i)}" y="${y(values[i]) - 7}" text-anchor="middle">${valueFmt(values[i])}</text>`; });
  svg.insertAdjacentHTML("beforeend", g);
  svg.querySelectorAll(".bar").forEach((b) => {
    const i = +b.dataset.i;
    const hit = document.createElementNS(NS, "rect");
    Object.entries({ x: x(i) - band / 2, y: m.t, width: band, height: ih, fill: "transparent" }).forEach(([k, v]) => hit.setAttribute(k, v));
    svg.appendChild(hit);
    hit.addEventListener("mousemove", () => {
      b.classList.add("is-hover");
      const scale = el.getBoundingClientRect().width / F.w;
      showTip(tip, el, `<b>${xTitle}: ${labels[i]}</b><div><i style="background:${color}"></i>${name}<span>${valueFmt(values[i])}</span></div>`, x(i) * scale, (y(values[i]) - 10) * scale - 50);
    });
    hit.addEventListener("mouseleave", () => { b.classList.remove("is-hover"); tip.style.opacity = 0; });
  });
}
