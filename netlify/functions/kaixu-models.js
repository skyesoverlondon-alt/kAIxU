// netlify/functions/kaixu-models.js
const { corsHeaders, json } = require("./_kaixu_utils");

exports.handler = async (event) => {
  const cors = corsHeaders(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  const models = [
    { id: "kAIxU6.7-flash", label: "kAIxU6.7 Flash — Skyes Over London (fast, recommended)", provider: "Skyes Over London" },
    { id: "kAIxU6.7-pro",   label: "kAIxU6.7 Pro — Skyes Over London (advanced reasoning)",  provider: "Skyes Over London" },
  ];

  const defaultModel = process.env.KAIXU_DEFAULT_MODEL || "kAIxU6.7-flash";

  return json(200, {
    ok: true,
    provider: "Skyes Over London",
    defaultModel,
    models,
  }, cors);
};
