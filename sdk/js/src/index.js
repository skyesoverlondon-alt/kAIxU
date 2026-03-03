/**
 * @kaixu/client — Official JavaScript client for the kAIxU AI gateway
 *
 * Works in: browsers, Node.js 18+, Cloudflare Workers, Deno, Bun
 *
 * Usage:
 *   import { KaixuClient } from '@kaixu/client';
 *   const kai = new KaixuClient({ token: 'YOUR_TOKEN' });
 *   const { text } = await kai.generate('Explain WebSockets in one paragraph.');
 */

const DEFAULT_BASE = "https://kaixu67.skyesoverlondon.workers.dev";
const DEFAULT_RETRIES = 2;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

// ─── Error types ──────────────────────────────────────────────────────────────

export class KaixuError extends Error {
  constructor(message, { status, code, requestId } = {}) {
    super(message);
    this.name = "KaixuError";
    this.status = status || null;
    this.code = code || null;
    this.requestId = requestId || null;
  }
}

export class KaixuAuthError extends KaixuError {
  constructor(message, opts) { super(message, opts); this.name = "KaixuAuthError"; }
}

export class KaixuQuotaError extends KaixuError {
  constructor(message, opts) { super(message, opts); this.name = "KaixuQuotaError"; }
}

export class KaixuUpstreamError extends KaixuError {
  constructor(message, opts) { super(message, opts); this.name = "KaixuUpstreamError"; }
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class KaixuClient {
  /**
   * @param {object} options
   * @param {string}  options.token    - Bearer token (required)
   * @param {string}  [options.base]   - Gateway URL (defaults to production)
   * @param {number}  [options.retries]- Auto-retry count for transient errors (default: 2)
   * @param {number}  [options.timeout]- Request timeout in ms (default: 120000)
   */
  constructor({ token, base, retries, timeout } = {}) {
    if (!token) throw new KaixuError("KaixuClient requires a token.");
    this._token   = token;
    this._base    = (base || DEFAULT_BASE).replace(/\/$/, "");
    this._retries = retries ?? DEFAULT_RETRIES;
    this._timeout = timeout ?? 120_000;
  }

  // ─── Internal fetch with retry ──────────────────────────────────────────────

  async _fetch(path, init = {}, retry = 0) {
    const url = `${this._base}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeout);

    let response;
    try {
      response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${this._token}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") throw new KaixuError(`Request timed out after ${this._timeout}ms.`);
      if (retry < this._retries) {
        await _sleep(400 * Math.pow(2, retry));
        return this._fetch(path, init, retry + 1);
      }
      throw new KaixuError(`Network error: ${err.message}`);
    }
    clearTimeout(timer);

    const requestId = response.headers.get("X-Request-ID") || null;

    // Retry on transient server errors
    if (RETRYABLE_STATUS.has(response.status) && retry < this._retries && response.status !== 429) {
      await _sleep(400 * Math.pow(2, retry));
      return this._fetch(path, init, retry + 1);
    }

    if (response.status === 401) {
      throw new KaixuAuthError("Missing or invalid token.", { status: 401, requestId });
    }
    if (response.status === 403) {
      const body = await _safeJson(response);
      const reason = body?.error || "Forbidden";
      if (reason.includes("quota")) throw new KaixuQuotaError(reason, { status: 403, requestId });
      throw new KaixuAuthError(reason, { status: 403, requestId });
    }
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After") || 60);
      throw new KaixuQuotaError(`Rate limited. Retry after ${retryAfter}s.`, { status: 429, requestId });
    }
    if (response.status === 503) {
      throw new KaixuUpstreamError("Upstream AI is temporarily unavailable. Retry in 30 seconds.", { status: 503, requestId });
    }

    return { response, requestId };
  }

  // ─── generate ───────────────────────────────────────────────────────────────

  /**
   * Generate text (blocking — waits for complete response).
   *
   * @param {string|object} input  - Prompt string, or full request body object
   * @param {object} [options]
   * @param {string}  [options.model]            - "kAIxU6.7-flash" (default) | "kAIxU6.7-pro" — provider: Skyes Over London
   * @param {string}  [options.system]           - Per-request system instruction (appended after KAIXU_CANON)
   * @param {Array}   [options.messages]         - Multi-turn history [{role, content}]
   * @param {object}  [options.generationConfig] - temperature, topP, maxOutputTokens, stopSequences
   * @param {object}  [options.output]           - { format: "json" | "text" | "markdown" }
   * @param {boolean} [options.includeRaw]       - Include raw upstream response
   * @returns {Promise<GenerateResult>}
   */
  async generate(input, options = {}) {
    const body = _buildBody(input, options);
    const { response, requestId } = await this._fetch("/v1/generate", {
      method: "POST",
      body: JSON.stringify(body),
    });

    const data = await response.json();
    data.requestId = data.requestId || requestId;

    if (!data.ok) {
      if (data.finishReason === "MAX_TOKENS") {
        // Partial content — not a hard error, caller decides
        return data;
      }
      throw new KaixuError(data.error || "Generation failed.", { status: response.status, requestId: data.requestId });
    }
    return data;
  }

  // ─── stream ─────────────────────────────────────────────────────────────────

  /**
   * Generate text via SSE streaming. Returns an async iterable of text chunks.
   *
   * ⚠ Do NOT use from Netlify-hosted apps — Netlify CDN buffers SSE.
   * Use generate() from Netlify. Use stream() from direct browser/server calls.
   *
   * @param {string|object} input
   * @param {object} [options] - Same as generate()
   * @returns {AsyncIterable<string>} - Yields text chunks as they arrive
   *
   * @example
   * for await (const chunk of kai.stream('Write a haiku')) {
   *   process.stdout.write(chunk);
   * }
   */
  async *stream(input, options = {}) {
    const body = _buildBody(input, options);
    const { response } = await this._fetch("/v1/stream", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!response.body) throw new KaixuError("Streaming not supported in this environment.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") return;

          try {
            const chunk = JSON.parse(raw);
            const text = (chunk.candidates?.[0]?.content?.parts || [])
              .filter(p => !p.thought)
              .map(p => p.text || "")
              .join("");
            if (text) yield text;
          } catch (_) {}
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Collect a full stream into a single string.
   * @param {string|object} input
   * @param {object} [options]
   * @returns {Promise<string>}
   */
  async streamCollect(input, options = {}) {
    let out = "";
    for await (const chunk of this.stream(input, options)) {
      out += chunk;
    }
    return out;
  }

  // ─── embed ──────────────────────────────────────────────────────────────────

  /**
   * Embed text into vectors.
   *
   * @param {string|string[]} content  - Single string or array for batch
   * @param {object} [options]
   * @param {string}  [options.model]     - "text-embedding-004" (default) | "embedding-001"
   * @param {string}  [options.taskType] - RETRIEVAL_DOCUMENT | RETRIEVAL_QUERY | SEMANTIC_SIMILARITY |
   *                                       CLASSIFICATION | CLUSTERING | QUESTION_ANSWERING | FACT_VERIFICATION
   * @returns {Promise<EmbedResult>}
   */
  async embed(content, options = {}) {
    const body = { content, ...options };
    const { response, requestId } = await this._fetch("/v1/embeddings", {
      method: "POST",
      body: JSON.stringify(body),
    });

    const data = await response.json();
    data.requestId = data.requestId || requestId;

    if (!data.ok) {
      throw new KaixuError(data.error || "Embedding failed.", { status: response.status, requestId: data.requestId });
    }
    return data;
  }

  /**
   * Convenience: embed and return just the float array (single string input only).
   * @param {string} text
   * @param {object} [options]
   * @returns {Promise<number[]>}
   */
  async embedValues(text, options = {}) {
    const result = await this.embed(text, options);
    return result.embeddings[0]?.values || [];
  }

  // ─── models ─────────────────────────────────────────────────────────────────

  /**
   * List available models. No auth required.
   * @returns {Promise<ModelsResult>}
   */
  async models() {
    const { response } = await this._fetch("/v1/models", {
      method: "GET",
      headers: { "Authorization": "" }, // override — no auth needed
    });
    return response.json();
  }

  // ─── health ─────────────────────────────────────────────────────────────────

  /**
   * Health check — confirms token is valid and worker is configured.
   * @returns {Promise<HealthResult>}
   */
  async health() {
    const { response, requestId } = await this._fetch("/v1/health", { method: "GET" });
    const data = await response.json();
    data.requestId = requestId;
    return data;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _buildBody(input, options) {
  if (typeof input === "string") {
    return { input: { type: "text", content: input }, ...options };
  }
  if (input && typeof input === "object") {
    return { ...input, ...options };
  }
  throw new KaixuError("input must be a string or object.");
}

async function _safeJson(response) {
  try { return await response.json(); } catch (_) { return null; }
}

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Default export ───────────────────────────────────────────────────────────

export default KaixuClient;

/**
 * @typedef {object} GenerateResult
 * @property {boolean} ok
 * @property {string}  model
 * @property {string}  text
 * @property {string}  finishReason
 * @property {object}  usage
 * @property {number}  usage.promptTokens
 * @property {number}  usage.candidatesTokens
 * @property {number}  usage.thoughtsTokens
 * @property {number}  usage.totalTokens
 * @property {string}  [requestId]
 *
 * @typedef {object} EmbedResult
 * @property {boolean}  ok
 * @property {string}   model
 * @property {Array<{index: number, values: number[]}>} embeddings
 * @property {object}   usage
 * @property {number}   usage.totalTokens
 *
 * @typedef {object} HealthResult
 * @property {boolean} ok
 * @property {string}  name
 * @property {boolean} keyConfigured
 * @property {boolean} authConfigured
 * @property {string}  time
 *
 * @typedef {object} ModelsResult
 * @property {boolean}  ok
 * @property {string}   defaultModel
 * @property {Array<{id: string, label: string}>} models
 */
