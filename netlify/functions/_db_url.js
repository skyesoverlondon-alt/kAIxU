"use strict";

function getDatabaseUrl() {
  return (
    process.env.NEON_DATABASE_URL ||
    process.env.NETLIFY_DATABASE_URL ||
    process.env.NETLIFY_DATABASE_URL_UNPOOLED ||
    ""
  ).trim();
}

module.exports = { getDatabaseUrl };
