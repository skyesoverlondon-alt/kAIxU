"""
kaixu — Official Python client for the kAIxU AI gateway

Install:
    pip install kaixu    # (once published)

Usage:
    from kaixu import KaixuClient

    kai = KaixuClient(token="YOUR_TOKEN")
    result = kai.generate("Explain WebSockets in one paragraph.")
    print(result.text)
"""

from __future__ import annotations

import json
import time
from typing import Any, Generator, Iterator, Optional, Union

try:
    import httpx
    _HAS_HTTPX = True
except ImportError:
    _HAS_HTTPX = False

try:
    import requests as _requests
    _HAS_REQUESTS = True
except ImportError:
    _HAS_REQUESTS = False

if not _HAS_HTTPX and not _HAS_REQUESTS:
    raise ImportError(
        "kaixu requires either 'httpx' or 'requests'. "
        "Install one: pip install httpx   or   pip install requests"
    )

DEFAULT_BASE    = "https://kaixu67.skyesoverlondon.workers.dev"
DEFAULT_RETRIES = 2
DEFAULT_TIMEOUT = 120  # seconds
RETRYABLE_STATUS = {429, 500, 502, 503, 504}


# ── Exceptions ─────────────────────────────────────────────────────────────────

class KaixuError(Exception):
    """Base exception for all kAIxU errors."""
    def __init__(self, message: str, *, status: int = None, request_id: str = None):
        super().__init__(message)
        self.status = status
        self.request_id = request_id

class KaixuAuthError(KaixuError):
    """Invalid, missing, revoked, or expired token."""

class KaixuQuotaError(KaixuError):
    """Monthly quota exceeded or rate limited."""

class KaixuUpstreamError(KaixuError):
    """Upstream AI provider error (circuit open or 502)."""


# ── Result types ────────────────────────────────────────────────────────────────

class GenerateResult:
    def __init__(self, data: dict, request_id: str = None):
        self._raw       = data
        self.ok         = data.get("ok", False)
        self.model      = data.get("model", "")
        self.text       = data.get("text", "")
        self.finish_reason = data.get("finishReason")
        self.request_id = data.get("requestId") or request_id
        usage           = data.get("usage") or {}
        self.prompt_tokens      = usage.get("promptTokens", 0)
        self.candidates_tokens  = usage.get("candidatesTokens", 0)
        self.thoughts_tokens    = usage.get("thoughtsTokens", 0)
        self.total_tokens       = usage.get("totalTokens", 0)
        self.error      = data.get("error")

    def __repr__(self):
        return f"<GenerateResult model={self.model!r} tokens={self.total_tokens} ok={self.ok}>"


class EmbedResult:
    def __init__(self, data: dict, request_id: str = None):
        self._raw       = data
        self.ok         = data.get("ok", False)
        self.model      = data.get("model", "kAIxU-embed")
        self.embeddings = data.get("embeddings", [])
        self.request_id = data.get("requestId") or request_id
        usage           = data.get("usage") or {}
        self.total_tokens = usage.get("totalTokens", 0)
        self.error      = data.get("error")

    @property
    def values(self) -> list[float]:
        """Shortcut: first embedding's float vector."""
        return self.embeddings[0]["values"] if self.embeddings else []

    def __repr__(self):
        dims = len(self.values) if self.values else 0
        return f"<EmbedResult model={self.model!r} embeddings={len(self.embeddings)} dims={dims}>"


# ── Client ──────────────────────────────────────────────────────────────────────

class KaixuClient:
    """
    Official Python client for the kAIxU AI gateway.

    Args:
        token:   Bearer token (required)
        base:    Gateway URL (default: production)
        retries: Auto-retry count for transient errors (default: 2)
        timeout: Request timeout in seconds (default: 120)
    """

    def __init__(
        self,
        token: str,
        *,
        base: str = DEFAULT_BASE,
        retries: int = DEFAULT_RETRIES,
        timeout: int = DEFAULT_TIMEOUT,
    ):
        if not token:
            raise KaixuError("KaixuClient requires a token.")
        self._token   = token
        self._base    = base.rstrip("/")
        self._retries = retries
        self._timeout = timeout
        self._headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type":  "application/json",
        }

    # ── Internal request ───────────────────────────────────────────────────────

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict = None,
        stream: bool = False,
        headers: dict = None,
    ):
        url = f"{self._base}{path}"
        req_headers = {**self._headers, **(headers or {})}

        for attempt in range(self._retries + 1):
            try:
                if _HAS_HTTPX:
                    client_cls = httpx.Client
                    kw = dict(
                        method=method, url=url,
                        headers=req_headers,
                        json=json_body,
                        timeout=self._timeout,
                    )
                    if stream:
                        # Return context manager for streaming
                        return httpx.stream(method, url, headers=req_headers, json=json_body, timeout=self._timeout)
                    with httpx.Client() as client:
                        resp = client.request(**kw)
                else:
                    if stream:
                        return _requests.request(
                            method, url, headers=req_headers, json=json_body,
                            timeout=self._timeout, stream=True,
                        )
                    resp = _requests.request(
                        method, url, headers=req_headers, json=json_body, timeout=self._timeout,
                    )
            except Exception as e:
                if attempt < self._retries:
                    time.sleep(0.4 * (2 ** attempt))
                    continue
                raise KaixuError(f"Network error: {e}")

            request_id = resp.headers.get("X-Request-ID")
            status = resp.status_code

            if status == 401:
                raise KaixuAuthError("Missing or invalid token.", status=401, request_id=request_id)

            if status == 403:
                body = _safe_json(resp)
                reason = (body or {}).get("error", "Forbidden")
                if "quota" in reason.lower():
                    raise KaixuQuotaError(reason, status=403, request_id=request_id)
                raise KaixuAuthError(reason, status=403, request_id=request_id)

            if status == 429:
                retry_after = int(resp.headers.get("Retry-After", 60))
                raise KaixuQuotaError(
                    f"Rate limited. Retry after {retry_after}s.",
                    status=429, request_id=request_id,
                )

            if status == 503:
                raise KaixuUpstreamError(
                    "Upstream AI temporarily unavailable. Retry in 30 seconds.",
                    status=503, request_id=request_id,
                )

            if status in RETRYABLE_STATUS and attempt < self._retries and status != 429:
                time.sleep(0.4 * (2 ** attempt))
                continue

            return resp

        raise KaixuError("Max retries exceeded.")

    # ── generate ───────────────────────────────────────────────────────────────

    def generate(
        self,
        input: Union[str, dict],
        *,
        model: str = None,
        system: str = None,
        messages: list = None,
        generation_config: dict = None,
        output: dict = None,
        include_raw: bool = False,
        **kwargs,
    ) -> GenerateResult:
        """
        Generate text (blocking — waits for complete response).

        Args:
            input:             Prompt string, or full request body dict
            model:             "kAIxU-flash" (default) | "kAIxU-pro"
            system:            Per-request system instruction
            messages:          Multi-turn history [{"role": "user", "content": "..."}]
            generation_config: {"temperature": 0.7, "maxOutputTokens": 8192, ...}
            output:            {"format": "json" | "text" | "markdown"}
            include_raw:       Include raw upstream response

        Returns:
            GenerateResult with .text, .model, .usage, .finish_reason, etc.
        """
        body = _build_body(input)
        if model:            body["model"] = model
        if system:           body["system"] = system
        if messages:         body["messages"] = messages
        if generation_config: body["generationConfig"] = generation_config
        if output:           body["output"] = output
        if include_raw:      body["includeRaw"] = True
        body.update(kwargs)

        resp = self._request("POST", "/v1/generate", json_body=body)
        request_id = resp.headers.get("X-Request-ID")
        data = resp.json()

        if not data.get("ok") and data.get("finishReason") != "MAX_TOKENS":
            raise KaixuError(
                data.get("error", "Generation failed."),
                status=resp.status_code,
                request_id=data.get("requestId") or request_id,
            )
        return GenerateResult(data, request_id=request_id)

    # ── stream ─────────────────────────────────────────────────────────────────

    def stream(
        self,
        input: Union[str, dict],
        *,
        model: str = None,
        system: str = None,
        messages: list = None,
        generation_config: dict = None,
        **kwargs,
    ) -> Iterator[str]:
        """
        Generate text via SSE streaming. Yields text chunks as they arrive.

        ⚠ Do NOT use from Netlify-hosted apps — Netlify CDN buffers SSE.

        Args: Same as generate()

        Yields:
            str: Text chunks as they stream in

        Example:
            for chunk in kai.stream("Write a haiku"):
                print(chunk, end="", flush=True)
        """
        body = _build_body(input)
        if model:             body["model"] = model
        if system:            body["system"] = system
        if messages:          body["messages"] = messages
        if generation_config: body["generationConfig"] = generation_config
        body.update(kwargs)

        if _HAS_HTTPX:
            with httpx.stream("POST", f"{self._base}/v1/stream",
                              headers=self._headers, json=body, timeout=None) as resp:
                _check_stream_status(resp)
                buffer = ""
                for chunk in resp.iter_text():
                    yield from _parse_sse_chunk(chunk, buffer_ref=[buffer])
        else:
            resp = self._request("POST", "/v1/stream", json_body=body, stream=True)
            _check_stream_status(resp)
            buffer = ""
            for raw_chunk in resp.iter_content(chunk_size=None, decode_unicode=True):
                yield from _parse_sse_chunk(raw_chunk, buffer_ref=[buffer])

    def stream_collect(self, input: Union[str, dict], **kwargs) -> str:
        """Stream and collect full response into a single string."""
        return "".join(self.stream(input, **kwargs))

    # ── embed ──────────────────────────────────────────────────────────────────

    def embed(
        self,
        content: Union[str, list[str]],
        *,
        model: str = None,
        task_type: str = None,
    ) -> EmbedResult:
        """
        Embed text into vectors.

        Args:
            content:   Single string or list of strings (batch)
            model:     "text-embedding-004" (default) | "embedding-001"
            task_type: RETRIEVAL_DOCUMENT | RETRIEVAL_QUERY | SEMANTIC_SIMILARITY |
                       CLASSIFICATION | CLUSTERING | QUESTION_ANSWERING | FACT_VERIFICATION

        Returns:
            EmbedResult with .embeddings (list of {index, values}) and .values (shortcut)
        """
        body: dict[str, Any] = {"content": content}
        if model:     body["model"] = model
        if task_type: body["taskType"] = task_type

        resp = self._request("POST", "/v1/embeddings", json_body=body)
        request_id = resp.headers.get("X-Request-ID")
        data = resp.json()

        if not data.get("ok"):
            raise KaixuError(
                data.get("error", "Embedding failed."),
                status=resp.status_code,
                request_id=data.get("requestId") or request_id,
            )
        return EmbedResult(data, request_id=request_id)

    def embed_values(self, text: str, **kwargs) -> list[float]:
        """Shortcut: embed a single string and return just the float array."""
        return self.embed(text, **kwargs).values

    # ── models ─────────────────────────────────────────────────────────────────

    def models(self) -> dict:
        """List available models. No auth required."""
        resp = self._request("GET", "/v1/models", headers={"Authorization": ""})
        return resp.json()

    # ── health ─────────────────────────────────────────────────────────────────

    def health(self) -> dict:
        """Health check — confirms token is valid and worker is configured."""
        resp = self._request("GET", "/v1/health")
        data = resp.json()
        data["requestId"] = resp.headers.get("X-Request-ID")
        return data


# ── Private helpers ─────────────────────────────────────────────────────────────

def _build_body(input: Union[str, dict]) -> dict:
    if isinstance(input, str):
        return {"input": {"type": "text", "content": input}}
    if isinstance(input, dict):
        return dict(input)
    raise KaixuError("input must be a string or dict.")

def _safe_json(resp):
    try:
        return resp.json()
    except Exception:
        return None

def _check_stream_status(resp):
    sc = getattr(resp, "status_code", None)
    if sc and sc >= 400:
        rid = resp.headers.get("X-Request-ID")
        if sc == 401: raise KaixuAuthError("Missing or invalid token.", status=sc, request_id=rid)
        if sc == 403: raise KaixuAuthError("Forbidden.", status=sc, request_id=rid)
        if sc == 429: raise KaixuQuotaError("Rate limited.", status=sc, request_id=rid)
        if sc == 503: raise KaixuUpstreamError("Upstream unavailable.", status=sc, request_id=rid)
        raise KaixuError(f"Upstream error {sc}.", status=sc, request_id=rid)

def _parse_sse_chunk(chunk: str, buffer_ref: list) -> Iterator[str]:
    """Parse one raw SSE chunk string, yields text pieces."""
    buffer_ref[0] += chunk
    while "\n" in buffer_ref[0]:
        line, buffer_ref[0] = buffer_ref[0].split("\n", 1)
        if not line.startswith("data: "):
            continue
        raw = line[6:].strip()
        if raw == "[DONE]":
            return
        try:
            data = json.loads(raw)
            parts = (
                data.get("candidates", [{}])[0]
                    .get("content", {})
                    .get("parts", [])
            )
            text = "".join(
                p.get("text", "") for p in parts if not p.get("thought")
            )
            if text:
                yield text
        except Exception:
            pass
