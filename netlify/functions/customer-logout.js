// netlify/functions/customer-logout.js
// POST /api/customer/logout
// Clears the session cookie.

"use strict";

const { clearSessionCookie, json, preflight } = require("./_customer_auth");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  // Both GET and POST clear the cookie — makes it easy to link to from HTML
  return json(200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
};
