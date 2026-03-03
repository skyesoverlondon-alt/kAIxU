const { corsHeaders, json } = require("./_kaixu_utils");

function present(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(event), body: "" };
  }

  if (event.httpMethod !== "GET") {
    return json(405, { ok: false, error: "Method not allowed" }, corsHeaders(event));
  }

  const gatewayChecks = {
    KAIXU_GEMINI_API_KEY: present("KAIXU_GEMINI_API_KEY"),
    KAIXU_APP_TOKENS: present("KAIXU_APP_TOKENS"),
    KAIXU_SERVICE_SECRETS: present("KAIXU_SERVICE_SECRETS"),
    KAIXU_SERVICE_SECRET: present("KAIXU_SERVICE_SECRET"),
    KAIXU_DEFAULT_MODEL: present("KAIXU_DEFAULT_MODEL"),
    KAIXU_ALLOWED_ORIGINS: present("KAIXU_ALLOWED_ORIGINS"),
    KAIXU_OPEN_GATE: present("KAIXU_OPEN_GATE"),
    KAIXU_MAX_BODY_BYTES: present("KAIXU_MAX_BODY_BYTES"),
    KAIXU_TIMEOUT_MS: present("KAIXU_TIMEOUT_MS"),
    KAIXU_GLOBAL_SYSTEM: present("KAIXU_GLOBAL_SYSTEM"),
    KAIXU_LOG_LEVEL: present("KAIXU_LOG_LEVEL"),
  };

  const dbChecks = {
    NEON_DATABASE_URL: present("NEON_DATABASE_URL"),
    NETLIFY_DATABASE_URL: present("NETLIFY_DATABASE_URL"),
    NETLIFY_DATABASE_URL_UNPOOLED: present("NETLIFY_DATABASE_URL_UNPOOLED"),
  };

  const customerChecks = {
    CUSTOMER_JWT_SECRET: present("CUSTOMER_JWT_SECRET"),
    PUBLIC_URL: present("PUBLIC_URL"),
    RESEND_API_KEY: present("RESEND_API_KEY"),
    RESEND_FROM: present("RESEND_FROM"),
  };

  const serviceSecretConfigured = gatewayChecks.KAIXU_SERVICE_SECRETS || gatewayChecks.KAIXU_SERVICE_SECRET;
  const dbConfigured = dbChecks.NEON_DATABASE_URL || dbChecks.NETLIFY_DATABASE_URL || dbChecks.NETLIFY_DATABASE_URL_UNPOOLED;

  return json(200, {
    ok: true,
    scope: "env-presence-only",
    generatedAt: new Date().toISOString(),
    summary: {
      aiProxyReady: gatewayChecks.KAIXU_GEMINI_API_KEY && gatewayChecks.KAIXU_APP_TOKENS,
      serviceSecretReady: serviceSecretConfigured,
      adminDbReady: dbConfigured,
    },
    checks: {
      gateway: gatewayChecks,
      database: dbChecks,
      customer: customerChecks,
    },
    notes: [
      "This endpoint never returns secret values, only presence booleans.",
      "If AI runs only in Cloudflare Worker, Netlify KAIXU_GEMINI_API_KEY is optional unless /v1/* routes are served by Netlify.",
    ],
  }, corsHeaders(event));
};