function getUpstreamBase() {
  return String(process.env.KAIXU_V1_UPSTREAM || "").trim().replace(/\/+$/, "");
}

function buildTargetUrl(event) {
  const base = getUpstreamBase();
  const path = String(event.path || "").replace(/^\/\.netlify\/functions\/v1-proxy/, "") || "/";
  const query = event.rawQuery || "";
  return `${base}${path}${query ? `?${query}` : ""}`;
}

function copyHeaders(event) {
  const incoming = event.headers || {};
  const headers = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (value == null) continue;
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "content-length" || lower === "x-forwarded-host") continue;
    headers[key] = value;
  }
  return headers;
}

exports.handler = async function (event) {
  const method = String(event.httpMethod || "GET").toUpperCase();
  const upstreamBase = getUpstreamBase();

  if (!upstreamBase) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        ok: false,
        error: "KAIXU_V1_UPSTREAM is not configured.",
      }),
    };
  }

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-KAIXU-TOKEN",
      },
      body: "",
    };
  }

  const url = buildTargetUrl(event);
  const headers = copyHeaders(event);
  const hasBody = method !== "GET" && method !== "HEAD";

  try {
    const upstream = await fetch(url, {
      method,
      headers,
      body: hasBody ? event.body : undefined,
    });

    const body = await upstream.text();
    const responseHeaders = {};
    upstream.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      statusCode: upstream.status,
      headers: responseHeaders,
      body,
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        ok: false,
        error: "Upstream proxy failure",
        details: error?.message || String(error),
      }),
    };
  }
};