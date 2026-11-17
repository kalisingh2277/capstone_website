/* architecture.js — interactive CNN → BiConvLSTM → heads diagram (Section 3.3) */

const STAGES = [
  {
    key: "input", group: "in", title: "Input tracklet", tag: "T × 1 × 1024²",
    blocks: [{ k: "frames", name: "Registered frames", dim: "T ≥ 3 · 1 ch · 1024×1024" }],
    detail: `<p>A tracklet is <b>T ≥ 3</b> observations of the same field. Each is a single-channel <b>1024 × 1024</b> crop, WCS-registered to a common reference grid and normalised with its median and MAD.</p>
             <p class="eq">X ∈ ℝ<sup>B×T×1×1024×1024</sup>, batch size B = 1 (tracklets may differ in length)</p>`,
  },
  {
    key: "cnn", group: "cnn", title: "Shared CNN encoder", tag: "weights shared over time",
    blocks: [
      { k: "stem", name: "Stem", dim: "512² × 12" },
      { k: "s4", name: "Stride-4", dim: "256² × 20", skip: true },
      { k: "s8", name: "Stride-8", dim: "128² × 28", skip: true },
      { k: "s16", name: "Stride-16", dim: "64² × 32" },
    ],
    detail: `<p>Frames are folded into the batch so every frame passes through the <b>same</b> encoder. The stem is a 3×3 stride-2 conv + GroupNorm + GELU; each later stage is a downsampling conv followed by a ConvNormAct block (two 3×3 convs, each with GroupNorm + GELU).</p>
             <p>The <b>stride-16</b> map feeds the temporal model. <b>Stride-4</b> and <b>stride-8</b> features of the reference frame are kept as skip connections for fine localisation.</p>`,
  },
  {
    key: "lstm", group: "lstm", title: "Bidirectional ConvLSTM", tag: "2 × 16 ch → 32 ch",
    blocks: [
      { k: "fwd", name: "Forward  t₀ → t_T", dim: "16 hidden ch", dir: "→" },
      { k: "bwd", name: "Backward  t_T → t₀", dim: "16 hidden ch", dir: "←" },
    ],
    detail: `<p>Two spatial ConvLSTM streams read the encoded sequence F ∈ ℝ<sup>B×T×32×64×64</sup>, one chronologically and one in reverse. Gates are <b>convolutional</b>, so hidden states keep their spatial layout.</p>
             <p class="eq">[i, f, o, g] = split(GN(Conv([x<sub>t</sub>, h<sub>t−1</sub>])))<br>c<sub>t</sub> = f ⊙ c<sub>t−1</sub> + i ⊙ tanh(g)  ·  h<sub>t</sub> = o ⊙ tanh(c<sub>t</sub>)</p>
             <p>Outputs are concatenated to 32 channels per step. This is an <b>offline</b> model: all frames are needed before predicting.</p>`,
  },
  {
    key: "fuse", group: "fuse", title: "Temporal fusion", tag: "96 → 32 ch @ 64²",
    blocks: [
      { k: "mean", name: "Temporal mean", dim: "32 ch" },
      { k: "max", name: "Temporal max", dim: "32 ch" },
      { k: "ref", name: "Reference state t_r = ⌊T/2⌋", dim: "32 ch" },
    ],
    detail: `<p>The bidirectional output is summarised three ways: the <b>mean</b> (persistent evidence), the <b>max</b> (strong activations at any time) and the hidden state at the <b>reference frame</b> t<sub>r</sub> = ⌊T/2⌋, which anchors where centres are predicted.</p>
             <p>Concatenated to 96 channels, a convolutional fusion block reduces them to 32.</p>`,
  },
  {
    key: "dec", group: "dec", title: "Skip-connected decoder", tag: "up to 256²",
    blocks: [
      { k: "d8", name: "↑ stride-8 + skip", dim: "60 → 24 ch" },
      { k: "d4", name: "↑ stride-4 + skip", dim: "36 → 16 ch · 256²" },
    ],
    detail: `<p>The fused map is bilinearly upsampled and concatenated with the reference frame's stride-8 features (60 → 24 ch), then again with the stride-4 features to give a <b>16-channel 256 × 256</b> representation.</p>
             <p>Skips bring back fine spatial detail; the main path carries temporally fused context, so the recurrent part never runs at full resolution.</p>`,
  },
  {
    key: "heads", group: "out", title: "Prediction heads", tag: "@ 256² (H/4 × W/4)",
    blocks: [
      { k: "hm", name: "Centre heatmap", dim: "1 ch" },
      { k: "vel", name: "Velocity (v_x, v_y)", dim: "2 ch · px/frame" },
      { k: "off", name: "Sub-pixel offset", dim: "2 ch" },
    ],
    detail: `<p>Instead of a map per frame or a fixed set of object slots, the network predicts one <b>centre heatmap</b> for the reference frame, plus <b>velocity</b> and <b>sub-pixel offset</b> regressions at each cell.</p>`,
  },
  {
    key: "traj", group: "out", title: "Localisation & trajectory", tag: "decoded tracks",
    blocks: [
      { k: "nms", name: "Peaks · threshold 0.85 · NMS 12 px", dim: "candidate centres" },
      { k: "rec", name: "x_t = x_r + v_x (t − t_r)", dim: "positions in every frame" },
    ],
    detail: `<p>Heatmap peaks above the confidence threshold (0.85) survive a 12-px non-maximum suppression. Each centre plus its velocity reconstructs the full track:</p>
             <p class="eq">x<sub>t</sub> = x<sub>r</sub> + v<sub>x</sub>(t − t<sub>r</sub>),  y<sub>t</sub> = y<sub>r</sub> + v<sub>y</sub>(t − t<sub>r</sub>)</p>
             <p>That is exactly what the <b>Detect</b> page draws: a red cross per frame and the trajectory through them.</p>`,
  },
];

export function renderArchitecture(root, detailEl) {
  root.innerHTML = `<div class="arch-flow">${STAGES.map((s, i) => `
    <button class="arch-stage g-${s.group}" data-key="${s.key}" aria-pressed="false">
      <span class="as-step">${String(i + 1).padStart(2, "0")}</span>
      <span class="as-title">${s.title}</span>
      <span class="as-tag">${s.tag}</span>
      <span class="as-blocks">${s.blocks.map((b) => `
        <span class="as-block ${b.skip ? "has-skip" : ""}">
          ${s.key === "input" ? `<span class="mini-stack"><i></i><i></i><i></i></span>` : ""}
          <span class="ab-name">${b.dir ? `<em>${b.dir}</em> ` : ""}${b.name}</span>
          <span class="ab-dim">${b.dim}</span>
        </span>`).join("")}</span>
      ${i < STAGES.length - 1 ? `<span class="arch-link" aria-hidden="true"><i></i></span>` : ""}
    </button>`).join("")}
  </div>`;

  const show = (key) => {
    const s = STAGES.find((x) => x.key === key);
    root.querySelectorAll(".arch-stage").forEach((b) => { const on = b.dataset.key === key; b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", on); });
    detailEl.innerHTML = `<div class="ad-head"><span class="ad-dot g-${s.group}"></span><h4>${s.title}</h4><span class="ad-tag">${s.tag}</span></div>${s.detail}`;
  };
  root.querySelectorAll(".arch-stage").forEach((b) => {
    b.addEventListener("click", () => show(b.dataset.key));
    b.addEventListener("mouseenter", () => show(b.dataset.key));
    b.addEventListener("focus", () => show(b.dataset.key));
  });
  show("lstm");
}
