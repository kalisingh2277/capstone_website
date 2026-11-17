/* doodles.js — light, fine-line astronomy illustrations drifting in the background.
 * Style: thin strokes, one soft colour (set in CSS: #doodles { color }), no fills. */

const S = `fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"`;
const T = `fill="none" stroke="currentColor" stroke-width=".9" stroke-linecap="round"`; // thinner secondary line
const dot = (x, y, r = 1.8) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor"/>`;

const D = {
  // constellation: stars joined by fine lines
  constellation: `<svg viewBox="0 0 140 90"><path ${T} d="M10 70 L38 52 L62 60 L88 30 L118 22 M88 30 L104 66 L62 60"/>
    ${dot(10, 70, 2)}${dot(38, 52, 2.6)}${dot(62, 60, 2)}${dot(88, 30, 3)}${dot(118, 22, 2.2)}${dot(104, 66, 2.4)}</svg>`,

  // orbital diagram: body + two inclined orbits + a small satellite
  orbit: `<svg viewBox="0 0 120 120"><circle ${S} cx="60" cy="60" r="7"/>
    <ellipse ${T} cx="60" cy="60" rx="50" ry="20" transform="rotate(-20 60 60)"/>
    <ellipse ${T} cx="60" cy="60" rx="34" ry="13" transform="rotate(35 60 60)" stroke-dasharray="2 4"/>
    ${dot(104, 44, 3)}${dot(35, 76, 2)}</svg>`,

  // celestial sphere wireframe
  sphere: `<svg viewBox="0 0 100 100"><circle ${S} cx="50" cy="50" r="40"/>
    <ellipse ${T} cx="50" cy="50" rx="40" ry="12"/><ellipse ${T} cx="50" cy="50" rx="40" ry="26" stroke-dasharray="2 4"/>
    <ellipse ${T} cx="50" cy="50" rx="14" ry="40"/><ellipse ${T} cx="50" cy="50" rx="28" ry="40" stroke-dasharray="2 4"/>
    <path ${T} d="M50 4v8M50 88v8"/></svg>`,

  // detection reticle
  reticle: `<svg viewBox="0 0 80 80"><circle ${S} cx="40" cy="40" r="22"/><circle ${T} cx="40" cy="40" r="10" stroke-dasharray="2 3"/>
    <path ${S} d="M40 6v14M40 60v14M6 40h14M60 40h14"/>${dot(40, 40, 1.6)}</svg>`,

  // light curve with a transit dip
  lightcurve: `<svg viewBox="0 0 150 70"><path ${T} d="M8 6v56h136"/>
    <path ${S} d="M12 24 C30 22, 44 26, 58 24 S70 22, 74 24 C78 26, 80 44, 86 44 S94 26, 98 24 C112 22, 126 26, 140 24"/>
    ${[20, 34, 48, 62, 84, 110, 124].map((x, i) => dot(x, [21, 27, 22, 27, 47, 21, 27][i], 1.3)).join("")}</svg>`,

  // spiral galaxy
  galaxy: `<svg viewBox="0 0 110 110"><g transform="rotate(-25 55 55)">
    <path ${S} d="M55 55c4-6 13-4 13 4 0 11-16 15-24 6-11-12 0-30 17-30 22 0 30 24 20 40-12 19-44 18-54-6"/>
    <path ${T} d="M55 55c-4 6-13 4-13-4 0-11 16-15 24-6 11 12 0 30-17 30-22 0-30-24-20-40 9-14 28-18 42-10"/></g>
    ${dot(55, 55, 2.6)}${dot(24, 30, 1.2)}${dot(88, 84, 1.2)}${dot(90, 26, 1)}</svg>`,

  // ringed planet (geometric)
  planet: `<svg viewBox="0 0 130 80"><circle ${S} cx="65" cy="40" r="20"/>
    <path ${S} d="M46 46c-22 8-34 16-30 20 6 6 46-2 78-18 28-14 36-26 28-29-6-2-18 1-32 7"/>
    <path ${T} d="M52 32c6-6 18-8 26-4"/></svg>`,

  // asteroid outline with craters (no face)
  asteroid: `<svg viewBox="0 0 80 64"><path ${S} d="M12 30 L20 14 L38 8 L56 12 L70 26 L66 46 L50 56 L28 56 L14 46 Z"/>
    <circle ${T} cx="34" cy="28" r="6"/><circle ${T} cx="52" cy="40" r="4"/><circle ${T} cx="50" cy="22" r="2.4"/></svg>`,

  // comet
  comet: `<svg viewBox="0 0 140 50"><circle ${S} cx="118" cy="18" r="6"/>
    <path ${T} d="M112 21C88 28 58 32 12 33M113 25C92 33 66 38 30 40M112 16C92 15 70 15 48 17"/></svg>`,

  // refractor telescope on tripod
  telescope: `<svg viewBox="0 0 100 90"><path ${S} d="M16 40 L68 18 L74 32 L22 54 Z"/><path ${S} d="M68 18 L80 13 L86 27 L74 32"/>
    <path ${T} d="M10 44 L16 40 M22 54 L16 58"/><path ${S} d="M46 42 L34 82 M48 42 L62 82 M47 42 V82"/></svg>`,

  // sky-chart grid patch (RA/Dec)
  grid: `<svg viewBox="0 0 120 90"><path ${T} d="M10 20 Q60 6 110 20 M10 45 Q60 31 110 45 M10 70 Q60 56 110 70"/>
    <path ${T} d="M24 10 Q20 45 26 82 M60 6 V84 M96 10 Q100 45 94 82" stroke-dasharray="2 4"/>
    ${dot(42, 34, 2)}${dot(78, 52, 1.6)}${dot(70, 22, 1.2)}</svg>`,

  // simple satellite
  satellite: `<svg viewBox="0 0 90 60"><rect ${S} x="37" y="22" width="16" height="16" rx="2"/>
    <path ${S} d="M8 20h22v20H8zM60 20h22v20H60z"/><path ${T} d="M19 20v20M71 20v20M30 30h7M53 30h7M45 22v-9M40 11c3-3 7-3 10 0"/></svg>`,

  sparkle: `<svg viewBox="0 0 30 30"><path ${S} d="M15 3 C15.6 11, 19 14.4, 27 15 C19 15.6, 15.6 19, 15 27 C14.4 19, 11 15.6, 3 15 C11 14.4, 14.4 11, 15 3 Z"/></svg>`,
  star: `<svg viewBox="0 0 20 20">${dot(10, 10, 2.2)}<path ${T} d="M10 2v4M10 14v4M2 10h4M14 10h4"/></svg>`,
};

// "detector at work": a source hopping frame to frame along its tracklet, followed by a reticle
const TRACKER = `<svg viewBox="0 0 420 160" class="dd-tracker">
  <path d="M20 130 L400 30" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 7" stroke-linecap="round"/>
  ${[0, 1, 2, 3, 4].map((i) => { const x = 20 + i * 95, y = 130 - i * 25; return `<rect x="${x - 16}" y="${y - 16}" width="32" height="32" rx="3" fill="none" stroke="currentColor" stroke-width="1" opacity=".7"/>`; }).join("")}
  <g class="dd-hop"><circle r="3" fill="currentColor"/><circle r="9" fill="none" stroke="#c9a75e" stroke-width="1.3"/>
    <path d="M0 -14v5M0 9v5M-14 0h5M9 0h5" stroke="#c9a75e" stroke-width="1.3" stroke-linecap="round"/></g>
</svg>`;

const LAYOUT = [
  // [doodle, left%, top%, sizePx, animation, delay(s), opacity] — sparse, spread over the page
  ["constellation", 7, 12, 150, "float-slow", 0, 0.9],
  ["planet", 78, 8, 130, "float-slow", 1.2, 0.85],
  ["sparkle", 52, 20, 20, "twinkle", 1.1, 1],
  ["sphere", 86, 40, 96, "spin", 0, 0.8],
  ["comet", 30, 44, 150, "drift", 0.5, 0.75],
  ["galaxy", 64, 66, 110, "spin", 1.4, 0.8],
  ["star", 12, 62, 16, "twinkle", 2.1, 1],
  ["orbit", 4, 84, 120, "spin", 2.6, 0.8],
  ["satellite", 86, 88, 80, "drift", 1.9, 0.75],
  ["star", 40, 90, 14, "twinkle", 0.9, 1],
];

export function mountDoodles(host) {
  if (!host) return;
  const html = LAYOUT.map(([k, l, t, size, anim, delay, op]) =>
    `<div class="dd a-${anim}" style="left:${l}%;top:${t}%;width:${size}px;animation-delay:-${delay * 3}s;opacity:${op}">${D[k]}</div>`
  ).join("");
  host.innerHTML = html + `<div class="dd dd-track-wrap" style="left:44%;top:3%;width:240px;opacity:.85">${TRACKER}</div>`;
}
