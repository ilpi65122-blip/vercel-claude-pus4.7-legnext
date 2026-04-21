// api/legnext.js
// Vercel serverless function that proxies requests to LegNext.ai
// Solves the browser CORS block by making the request server-side and
// echoing the response back with permissive CORS headers.
//
// The artifact sends:
//   POST  /api/legnext  body: { method: "POST", path: "/diffusion", apiKey, body: {...} }
//   POST  /api/legnext  body: { method: "GET",  path: "/job/<id>",  apiKey }
//
// We forward to https://api.legnext.ai/api/v1<path> with the x-api-key header
// and pipe the JSON response back. The API key never lives on the server —
// it's passed in per-request from the user's browser session.

const LEGNEXT_BASE = "https://api.legnext.ai/api/v1";

// Endpoints this proxy is allowed to forward. Locks the proxy down so it
// can't be abused as a generic open relay if the URL ever leaks.
const ALLOWED_PATHS = [
  /^\/diffusion$/,
  /^\/job\/[a-zA-Z0-9-]+$/,
  /^\/account\/balance$/,
];

function setCors(res, origin) {
  // If you want to lock this to your own domain only, replace "*" with that origin.
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export default async function handler(req, res) {
  setCors(res, req.headers.origin);

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { method, path, apiKey, body } = req.body || {};

  if (!method || !path || !apiKey) {
    return res
      .status(400)
      .json({ error: "Missing required fields: method, path, apiKey" });
  }

  // Path allowlist
  if (!ALLOWED_PATHS.some((rx) => rx.test(path))) {
    return res.status(403).json({ error: `Path not allowed: ${path}` });
  }

  // Forward
  try {
    const url = `${LEGNEXT_BASE}${path}`;
    const fetchOpts = {
      method,
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
    };
    if (method === "POST" && body) {
      fetchOpts.body = JSON.stringify(body);
    }

    const upstream = await fetch(url, fetchOpts);
    const text = await upstream.text();

    // Mirror status + content type so the artifact gets exactly what LegNext sent
    res.status(upstream.status);
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/json"
    );
    return res.send(text);
  } catch (err) {
    return res.status(502).json({
      error: "Upstream request failed",
      detail: err.message || String(err),
    });
  }
}
