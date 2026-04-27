// api/fal.js
// Vercel serverless proxy for fal.ai. Solves browser CORS restrictions.
//
// Artifact sends:
//   { method: "POST", path: "/fal-ai/kling-video/v2.6/pro/text-to-video",      apiKey, body: {...} }
//   { method: "GET",  path: "/fal-ai/kling-video/requests/<id>/status",         apiKey }
//   { method: "GET",  path: "/fal-ai/kling-video/requests/<id>",                apiKey }
//
// We forward to fal.run (submit) or queue.fal.run (status/result) with the
// Authorization: Key <apiKey> header and echo the response.

const FAL_SUBMIT_BASE = "https://fal.run";
const FAL_QUEUE_BASE = "https://queue.fal.run";

// Lock down which paths this proxy will forward
const ALLOWED_PATHS = [
  // Submit text-to-video (any Kling version/tier)
  /^\/fal-ai\/kling-video\/[a-zA-Z0-9.-]+\/(pro|standard|master|turbo)\/text-to-video$/,
  /^\/fal-ai\/kling-video\/v[0-9.]+\/(pro|standard|master)\/text-to-video$/,
  // Status and result polling — supports both flat and tiered model paths
  /^\/fal-ai\/kling-video\/requests\/[a-zA-Z0-9-]+(\/status)?$/,
  /^\/fal-ai\/kling-video\/[a-zA-Z0-9.-]+\/(pro|standard|master|turbo)\/requests\/[a-zA-Z0-9-]+(\/status)?$/,
  // Lyria 2 music generation
  /^\/fal-ai\/lyria2$/,
  /^\/fal-ai\/lyria2\/requests\/[a-zA-Z0-9-]+(\/status)?$/,
];

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const { method, path, apiKey, body } = req.body || {};
  if (!method || !path || !apiKey) {
    return res.status(400).json({ error: "Missing required fields: method, path, apiKey" });
  }

  if (!ALLOWED_PATHS.some((rx) => rx.test(path))) {
    return res.status(403).json({ error: `Path not allowed: ${path}` });
  }

  // Status/result calls use queue.fal.run, submit uses fal.run
  const isQueueCall = /\/requests\//.test(path);
  const baseUrl = isQueueCall ? FAL_QUEUE_BASE : FAL_SUBMIT_BASE;
  const url = `${baseUrl}${path}`;

  try {
    const fetchOpts = {
      method,
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
    };
    if (method === "POST" && body) {
      fetchOpts.body = JSON.stringify(body);
    }

    const upstream = await fetch(url, fetchOpts);
    const text = await upstream.text();

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
};
