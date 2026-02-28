// netlify/functions/kaixu-models.js
const { corsHeaders, json } = require("./_kaixu_utils");

exports.handler = async (event) => {
  const cors = corsHeaders(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  // Curated list: edit anytime. Keeping it simple and stable for your apps.
  const models = [
    { id: "gemini-2.5-flash", label: "gemini-2.5-flash (fast)" },
    { id: "gemini-2.5-pro", label: "gemini-2.5-pro (best quality)" },
    { id: "gemini-2.0-flash", label: "gemini-2.0-flash (legacy fast)" },
  ];

  const defaultModel = process.env.KAIXU_DEFAULT_MODEL || "gemini-2.5-flash";

  return json(200, {
    ok: true,
    defaultModel,
    models,
  }, cors);
};
