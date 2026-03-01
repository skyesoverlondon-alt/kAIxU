// netlify/functions/_customer_auth.js
// Shared session helpers for the customer self-serve portal.
// Uses CUSTOMER_JWT_SECRET (or falls back to KAIXU_SERVICE_SECRET) to sign/verify
// HTTP-only session cookies.

"use strict";

const { TextEncoder } = require("util");
const crypto = require("crypto");

const COOKIE_NAME = "kxp_session"; // kAIxU Portal Session

// ── JWT helpers ───────────────────────────────────────────────────────────────

function getSecret() {
  const s = process.env.CUSTOMER_JWT_SECRET || process.env.KAIXU_SERVICE_SECRET || "";
  if (!s || s.length < 16) throw new Error("CUSTOMER_JWT_SECRET is not configured.");
  return new TextEncoder().encode(s);
}

async function signSession(payload) {
  const { SignJWT } = await import("jose");
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

async function verifySession(token) {
  const { jwtVerify } = await import("jose");
  const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
  return payload;
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

function getCookieValue(event, name) {
  const header = (event.headers || {}).cookie || "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === name) return decodeURIComponent(v);
  }
  return null;
}

async function requireCustomerSession(event) {
  const raw = getCookieValue(event, COOKIE_NAME);
  if (!raw) return { customer: null, error: "Not authenticated" };
  try {
    const payload = await verifySession(raw);
    return { customer: payload, error: null };
  } catch {
    return { customer: null, error: "Invalid or expired session" };
  }
}

function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

// ── Token helpers ─────────────────────────────────────────────────────────────

function generateMagicToken() {
  return crypto.randomBytes(32).toString("hex"); // 64 hex chars
}

// ── Response helpers ──────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(status, obj, extraHeaders = {}) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS,
      ...extraHeaders,
    },
    body: JSON.stringify(obj),
  };
}

function redirect(url, extraHeaders = {}) {
  return {
    statusCode: 302,
    headers: { Location: url, ...extraHeaders },
    body: "",
  };
}

function preflight() {
  return { statusCode: 204, headers: CORS, body: "" };
}

module.exports = {
  signSession,
  verifySession,
  requireCustomerSession,
  sessionCookie,
  clearSessionCookie,
  generateMagicToken,
  json,
  redirect,
  preflight,
  COOKIE_NAME,
};
