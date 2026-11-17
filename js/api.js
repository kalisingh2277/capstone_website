/* api.js — the single HTTP POST call: 2..n images -> JSON */
import { CONFIG, isDemoMode } from "./config.js";
import { mockDetect } from "./mock.js";

export class ApiError extends Error {
  constructor(message, detail) { super(message); this.detail = detail; }
}

/**
 * Send the ordered frames to the detection API.
 * @param {Array<{file: File, name: string}>} items  in chronological order
 * @returns {Promise<{raw: any, roundTripMs: number, demo: boolean}>}
 */
export async function runDetection(items, { signal } = {}) {
  const t0 = performance.now();

  if (isDemoMode()) {
    const raw = await mockDetect(items, { signal });
    return { raw, roundTripMs: performance.now() - t0, demo: true };
  }

  const { url, method, fileField, orderField, extraFields, headers, timeoutMs } = CONFIG.api;
  const form = new FormData();
  items.forEach((it) => form.append(fileField, it.file, it.name));
  if (orderField) form.append(orderField, JSON.stringify(items.map((it) => it.name)));
  Object.entries(extraFields || {}).forEach(([k, v]) => form.append(k, String(v)));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("timeout"), timeoutMs);
  if (signal) signal.addEventListener("abort", () => ctrl.abort("cancelled"));

  let res;
  try {
    res = await fetch(url, { method, body: form, headers, signal: ctrl.signal });
  } catch (err) {
    clearTimeout(timer);
    if (ctrl.signal.aborted) {
      throw new ApiError(ctrl.signal.reason === "timeout"
        ? `The API did not answer within ${Math.round(timeoutMs / 1000)} s.`
        : "Request cancelled.");
    }
    throw new ApiError(
      "Could not reach the API. Check the URL in js/config.js, that the server is running, and that it allows CORS from this site.",
      String(err)
    );
  }
  clearTimeout(timer);

  const text = await res.text();
  let raw;
  try { raw = text ? JSON.parse(text) : {}; }
  catch { throw new ApiError(`The API answered (HTTP ${res.status}) but not with JSON.`, text.slice(0, 600)); }

  if (!res.ok) {
    const msg = raw?.error || raw?.detail || raw?.message || `HTTP ${res.status}`;
    throw new ApiError(`The API returned an error: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`, raw);
  }
  return { raw, roundTripMs: performance.now() - t0, demo: false };
}
