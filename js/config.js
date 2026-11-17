/* =====================================================================
 * config.js — the ONLY file you should need to touch to wire up the API.
 * ---------------------------------------------------------------------
 *  1. Put your endpoint in `api.url`.
 *  2. If your JSON keys differ from the defaults, edit `responseMap`
 *     (dot-paths are supported, e.g. "result.tracks").
 *  3. If the shape is very different, write `transformResponse(raw)`
 *     and return the normalized object described in README.md.
 * ===================================================================== */

export const CONFIG = {
  api: {
    // e.g. "https://your-server.example.com/predict"
    // Leave empty to run the dashboard in DEMO mode (fake, client-side results).
    url: "",
    method: "POST",

    // Multipart field name for the images. Each file is appended under this
    // name, in the chronological order shown in the UI (t0, t1, ... tN).
    fileField: "files",

    // Also send the filenames in order as a JSON string field (handy for
    // servers that want to double-check sequence order). Set null to disable.
    orderField: "order",

    // Any extra form fields to send with every request.
    // e.g. { threshold: 0.85, nms_radius: 12 }
    extraFields: {},

    // Extra request headers (do NOT set Content-Type; the browser sets the
    // multipart boundary itself). e.g. { Authorization: "Bearer <token>" }
    headers: {},

    timeoutMs: 180000,
  },

  // "auto"  -> demo mode when api.url is empty
  // true    -> always demo mode (never calls the API)
  // false   -> always call the API
  demoMode: "auto",

  upload: {
    minFiles: 2,
    maxFiles: 64,
    extensions: [".fits", ".fit", ".fts", ".png"],
    // FITS row 0 is drawn at the TOP (numpy / matplotlib origin="upper"),
    // which matches pixel coordinates coming out of a PyTorch model.
    // Flip only if your API reports coordinates with origin at the bottom.
    fitsFlipY: false,
    previewMaxSide: 1024, // previews are downscaled to this for display only
  },

  viewer: {
    baseFps: 2,                  // 1x playback = 2 frames / second
    speeds: [0.25, 0.5, 1, 2, 4],
    defaultSpeed: 1,
    colors: {
      prediction: "#ff4d4d",     // red cross  (same as the paper's figures)
      groundTruth: "#4ade80",    // green circle
      trajectory: "#ffd166",
    },
  },

  /* -------------------------------------------------------------------
   * Where things live in the API response (default contract shown in
   * README.md). Paths are relative to the response root, except the
   * `det`, `pos` and `vel` groups which are relative to each item.
   * ----------------------------------------------------------------- */
  responseMap: {
    detections: "detections",            // array of detected tracks
    det: {
      id: "id",
      confidence: "confidence",          // 0..1 (or 0..100, auto-detected)
      positions: "positions",            // [{frame, x, y}, ...]   (preferred)
      center: "center",                  // {x, y} on the reference frame (fallback)
      velocity: "velocity",              // {vx, vy} in px / frame
      label: "label",
    },
    pos: { frame: "frame", x: "x", y: "y" },
    vel: { vx: "vx", vy: "vy" },

    annotatedFrames: "annotated_frames", // [url | base64 | data-URI, ...] optional
    processingTime: "processing_time_ms",// number (ms) optional
    referenceFrame: "reference_frame",   // int, defaults to floor(T/2) like the paper
    imageSize: "image_size",             // [w, h] or {width, height} optional
    groundTruth: "ground_truth",         // same shape as detections, optional
    metrics: "metrics",                  // free-form {key: number|string}, optional
    downloadUrl: "download_url",         // server-side bundle, optional
    message: "message",
  },

  // Optional escape hatch. Receives the raw JSON, must return the
  // normalized result (see README "Normalized result"). Leave null to use
  // responseMap.
  transformResponse: null,

  paper: {
    pdfUrl: "assets/paper.pdf",
  },
};

export const isDemoMode = () =>
  CONFIG.demoMode === true || (CONFIG.demoMode === "auto" && !CONFIG.api.url);
