
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
    // Modal FastAPI prediction endpoint.
    url: "https://sameernalbandh1404--asteroid-detection-api-fastapi-app.us-east.modal.run/predict",
    method: "POST",

    // Multipart field name expected by FastAPI.
    // Each FITS file is appended under "frames" in chronological order.
    fileField: "frames",

    // API does not require a separate filename-order field.
    orderField: null,

    // Extra FastAPI form fields sent with every request.
    extraFields: {
      confidence_threshold: 0.85,
      nms_radius_px: 12,
    },

    // Extra request headers.
    // Do NOT set Content-Type; the browser sets the multipart boundary.
    headers: {},

    timeoutMs: 180000,
  },

  // "auto"  -> demo mode when api.url is empty
  // true    -> always demo mode (never calls the API)
  // false   -> always call the API
  demoMode: false,

  upload: {
    // API requires at least three frames.
    minFiles: 3,

    // API supports variable-length sequences (T >= 3).
    maxFiles: 64,

    // Supported FITS formats accepted by the API endpoint.
    extensions: [".fits", ".fits.fz"],

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
   * Where things live in the API response.
   *
   * Paths are relative to the response root, except the
   * `det`, `pos` and `vel` groups which are relative to each item.
   *
   * Mapped to the actual BiConvLSTM FastAPI response.
   * ----------------------------------------------------------------- */

  responseMap: {
    detections: "detections",            // array of detected candidates

    det: {
      id: "candidate_id",
      confidence: "confidence",          // 0..1
      positions: "trajectory_px",        // [{frame_index, x, y}, ...]
      center: "position_px",              // {x, y} on the reference frame
      velocity: "velocity_px_per_frame", // {vx, vy} in pixels / frame
      label: "label",
    },

    pos: {
      frame: "frame_index",
      x: "x",
      y: "y",
    },

    vel: {
      vx: "vx",
      vy: "vy",
    },

    annotatedFrames: "annotated_frames", // [url | base64 | data-URI, ...] optional

    // API reports timings in seconds, not milliseconds.
    // Leave processingTime unmapped to avoid displaying incorrect units.
    processingTime: null,

    referenceFrame: "reference_frame_index", // int, defaults to floor(T/2)
    imageSize: "image_size",                 // [w, h] or {width, height} optional
    groundTruth: "ground_truth",             // same shape as detections, optional
    metrics: "timings_seconds",              // API preprocessing/inference timings
    downloadUrl: "download_url",             // server-side bundle, optional
    message: "note",
  },

  // Optional escape hatch. Receives the raw JSON, must return the
  // normalized result (see README "Normalized result").
  // Leave null to use responseMap.
  transformResponse: null,

  paper: {
    pdfUrl: "assets/paper.pdf",
  },
};

export const isDemoMode = () =>
  CONFIG.demoMode === true ||
  (CONFIG.demoMode === "auto" && !CONFIG.api.url);
