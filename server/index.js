import express from "express";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const siteRoot = path.resolve(path.join(__dirname, ".."));
const indexFile = path.join(siteRoot, "index.html");

app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));
app.use(express.static(siteRoot));

app.get("/health", (_req, res) => {
  res.json({ ok: true, status: "healthy" });
});

app.get("/", (_req, res) => {
  res.json({ ok: true, message: "kAIxU Node server is running" });
});

// Non-stream chat completion
app.post("/api/chat", async (req, res) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ ok: false, error: "OPENAI_API_KEY is not set." });

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const { messages, max_tokens, temperature } = req.body || {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({ ok: false, error: "Body must include messages: []" });
  }

  try {
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model, messages, max_tokens, temperature, stream: false }),
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ ok: false, error: "Upstream error", details: text.slice(0, 4000) });
    }
    const data = JSON.parse(text);
    return res.json({ ok: true, model, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

app.post("/api/chat/stream", async (req, res) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ ok: false, error: "OPENAI_API_KEY is not set." });

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const { messages, max_tokens, temperature } = req.body || {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({ ok: false, error: "Body must include messages: []" });
  }

  const controller = new AbortController();
  req.on("close", () => controller.abort());

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  try {
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model, messages, stream: true, max_tokens, temperature }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      res.status(upstream.status).json({ ok: false, error: "Upstream error", details: text.slice(0, 4000) });
      return;
    }

    for await (const chunk of upstream.body) {
      res.write(chunk);
    }
  } catch (err) {
    if (controller.signal.aborted) return;
    res.write(`data: ${JSON.stringify({ error: err.message || String(err) })}\n\n`);
  } finally {
    res.end();
  }
});

// Image generation → base64 response
app.post("/api/image", async (req, res) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ ok: false, error: "OPENAI_API_KEY is not set." });

  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const size = process.env.OPENAI_IMAGE_SIZE || "1024x1024";
  const { prompt } = req.body || {};
  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ ok: false, error: "Body must include prompt" });
  }

  try {
    const upstream = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model, prompt, size, response_format: "b64_json" }),
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ ok: false, error: "Upstream error", details: text.slice(0, 4000) });
    }
    const data = JSON.parse(text);
    const b64 = data?.data?.[0]?.b64_json || null;
    if (!b64) return res.status(502).json({ ok: false, error: "No image returned" });
    return res.json({ ok: true, model, size, image: `data:image/png;base64,${b64}` });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(indexFile);
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

const server = app.listen(port, () => {
  console.log(`kAIxU server listening on port ${port}`);
});

process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);

function shutDown() {
  server.close(() => process.exit(0));
}
