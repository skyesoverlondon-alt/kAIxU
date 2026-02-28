// netlify/functions/kaixu-health.js
const { corsHeaders, json } = require("./_kaixu_utils");

exports.handler = async (event) => {
  const cors = corsHeaders(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  const hasKey = !!(process.env.KAIXU_GEMINI_API_KEY && process.env.KAIXU_GEMINI_API_KEY.trim());
  const hasTokens = !!(process.env.KAIXU_APP_TOKENS && process.env.KAIXU_APP_TOKENS.trim());
  const openGate = String(process.env.KAIXU_OPEN_GATE || "0") === "1";

  return json(200, {
    ok: true,
    name: "Kaixu Gate Delta",
    kAIxu: true,
    keyConfigured: hasKey,
    authConfigured: hasTokens || openGate,
    openGate,
    time: new Date().toISOString(),
  }, cors);
};
