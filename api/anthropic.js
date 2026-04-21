// api/anthropic.js
// Vercel serverless function — proxies requests to api.anthropic.com.
// Browsers cannot call the Anthropic API directly (CORS + no auth), so we
// proxy through our own server. The API key is sent from the browser
// per-request and never stored.

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const apiKey = req.headers["x-api-key"];
  if (!apiKey) {
    return res.status(400).json({ error: "Missing x-api-key header" });
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    return res.send(text);
  } catch (err) {
    return res.status(502).json({
      error: "Upstream request failed",
      detail: err.message || String(err),
    });
  }
};
