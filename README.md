# Faint Movers: ConvLSTM asteroid-detection dashboard

A static, dependency-free website for the IEOM 2026 paper
*"A ConvLSTM Framework for Faint Moving-Source Detection in Astronomical Image Sequences"*.

Pages: **Home · Detect · Methodology · Dataset · Results · Paper**

The core flow on **Detect**: 2…n images → **one HTTP POST** → JSON → viewer, trajectories, metrics, downloads.

---

## Run it

No build step. Any static server works (ES modules need `http://`, not `file://`):

```bash
cd asteroid-dashboard
python -m http.server 8000
# open http://localhost:8000
```

Deploy by uploading the folder to GitHub Pages, Netlify, Vercel, or any static host.

With no API URL set, the site runs in **demo mode**: a fake detector runs in the browser, and
**Load sample tracklet** generates a synthetic DECam-like sequence with two injected movers.

---

## Connect your API (the only file to edit: `js/config.js`)

```js
api: {
  url: "https://your-server/predict",  // ← set this
  fileField: "files",                  // multipart field, repeated once per frame, in order
  orderField: "order",                 // JSON list of filenames in order (null to disable)
  extraFields: {},                     // e.g. { threshold: 0.85 }
  headers: {},                         // e.g. { Authorization: "Bearer …" }
}
```

### Request (what the site sends)

`POST <url>` as `multipart/form-data`:

| field   | value                                                        |
|---------|--------------------------------------------------------------|
| `files` | each image (`.fits/.fit/.fts/.png`), **in chronological order** t0…tN |
| `order` | `["t0_name.fits", "t1_name.fits", …]` (JSON string)          |
| + any `extraFields` |                                                  |

### Response (default contract, **assumed** until you send yours)

```json
{
  "processing_time_ms": 842,
  "reference_frame": 2,
  "image_size": [1024, 1024],
  "detections": [
    {
      "id": 1,
      "confidence": 0.97,
      "center":   { "x": 457.8, "y": 268.5 },
      "velocity": { "vx": 63.0, "vy": 30.5 },
      "positions": [ { "frame": 0, "x": 331.7, "y": 207.5 }, { "frame": 1, "x": 394.8, "y": 238.0 } ]
    }
  ],
  "annotated_frames": ["<base64 PNG or URL>", "..."],
  "ground_truth": [],
  "metrics": { "confidence_threshold": 0.85, "nms_radius_px": 12 },
  "download_url": "https://…/bundle.zip",
  "message": "optional note shown above the metrics"
}
```

Everything except `detections` is optional. The adapter is forgiving:

- **positions** may be `[{frame,x,y}]`, `[[x,y], …]` or `[[frame,x,y], …]`.
- If **positions** are missing but **center + velocity** are present, tracks are rebuilt with the paper's
  Eq. (2): `x_t = x_r + v_x (t − t_r)`, with `t_r = reference_frame` (default `⌊T/2⌋`).
- **confidence** in 0–100 is converted to 0–1.
- **annotated_frames** can be bare base64, data-URIs or URLs. When present, the viewer gets an
  "API annotated / Overlay" toggle, and downloads use the API's images.
- **metrics**: any flat key/value pairs are listed under "Reported by the API".
- **image_size** sets the coordinate space for overlays (defaults to the uploaded image size).
  If your model works on 1024×1024 crops of bigger frames, return `image_size: [1024, 1024]`
  and return annotated frames, or crop before upload.

**Different key names?** Edit `responseMap` in `config.js` (dot-paths such as `"result.tracks"` work).
**Completely different shape?** Set `transformResponse: (raw) => ({ detections: [...], ... })`.

### CORS

The browser calls your API directly, so the server must allow the site's origin. FastAPI example:

```python
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["POST"], allow_headers=["*"])

@app.post("/predict")
async def predict(files: list[UploadFile] = File(...), order: str = Form(None)):
    ...
```

Flask: `pip install flask-cors`, then `CORS(app)`.

---

## Files

```
index.html            all six pages (hash-routed: #home, #detect, …)
css/styles.css        design tokens, layout, doodle animations, responsive rules
js/config.js          ← API URL, field names, response map, viewer colours
js/api.js             the single POST request (timeout, cancel, error messages)
js/adapter.js         raw JSON → normalized result
js/mock.js            demo mode: fake API + synthetic sample tracklet
js/upload.js          drop / preview / drag-reorder / remove / sort by name or DATE-OBS
js/fits.js            tiny FITS reader (BITPIX 8/16/32/-32/-64, BZERO/BSCALE, multi-extension)
js/viewer.js          frame player: play/pause, prev/next, speed, scrubber, overlays, hover readout
js/results.js         run-summary metrics, detection table, trajectory plot, coordinate table
js/downloads.js       JSON / CSV / annotated PNG / ZIP (built in-browser, no libraries)
js/architecture.js    interactive CNN → BiConvLSTM → heads diagram
js/charts.js          SVG charts for the Results page
js/paperdata.js       numbers from Tables 2, 4, 5, 6 of the paper
js/doodles.js         background doodles
assets/               figures from the paper + paper.pdf
```

### Normalized result (what the UI consumes)

```js
{
  nFrames, referenceFrame, imageSize: {w, h},
  detections:  [{ id, confidence, velocity: {vx, vy}, speed, positions: [{frame, x, y}] }],
  groundTruth: [ same shape ],
  annotatedFrames: [src | null], processingTimeMs, roundTripMs,
  metrics: {}, downloadUrl, message, raw
}
```

## Notes and limits (v1)

- Coordinates are pixels in the registered image grid, with origin top-left (FITS row 0 drawn at the top,
  like numpy/matplotlib `origin="upper"`). Flip with `upload.fitsFlipY` if your API differs.
- Tile-compressed `.fz` FITS can't be previewed in the browser, but they are still sent to the API untouched.
- FITS previews are for display only; the API always receives the original files.
- Chart palette validated for colour-vision deficiency (blue `#3355a8`, coral `#d9603b`, teal `#2a9d8f`);
  overlays use red ✕ for predictions and green ○ for ground truth, matching the paper's figures.

---

## Live API (current)

`js/config.js` points at the Modal deployment
(`…asteroid-detection-api-fastapi-app.us-east.modal.run/predict`):

- request: `multipart/form-data`, files under `frames` (≥ 3, `.fits` / `.fits.fz`, chronological),
  plus `confidence_threshold`, `nms_radius_px`, and an optional `ccd` (typed on the Detect page)
- response keys: `detections[].candidate_id / confidence / position_px / velocity_px_per_frame / trajectory_px[{frame_index,x,y}]`,
  `reference_frame_index`, `timings_seconds` (processing time is read from its `total`), `note`
- coordinates are on the API's **registered 1024 × 1024 reference crop** (`coordinateSpace` in config)

**Exact frame display:** if the API also returns the registered crops as base64 PNGs under
`registered_frames` (one per input frame), the viewer draws its markers on those, pixel-exact.
Without them it shows a centre crop of each raw upload and labels the markers as approximate.
`.fits.fz` files can't be previewed in the browser but are still sent to the API.
