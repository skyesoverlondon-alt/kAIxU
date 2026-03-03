import crypto from "crypto";

export function corsHeaders(origin, allowlistRaw=""){
  const allowlist = (allowlistRaw||"").split(",").map(s=>s.trim()).filter(Boolean);
  const ok = !origin || allowlist.length===0 || allowlist.some(pat=>matchOrigin(origin, pat));
  const o = ok ? (origin || "*") : "null";
  return {
    "access-control-allow-origin": o,
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-credentials": "true",
    "vary": "Origin",
  };
}

function matchOrigin(origin, pattern){
  if(pattern.includes("*")){
    const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp("^"+esc+"$").test(origin);
  }
  return origin === pattern;
}

export function json(statusCode, obj, origin, extraHeaders={}){
  return {
    statusCode,
    headers: {
      "content-type":"application/json; charset=utf-8",
      ...corsHeaders(origin, process.env.ORIGIN_ALLOWLIST),
      ...extraHeaders,
    },
    body: JSON.stringify(obj),
  };
}

export function ok(obj, origin, extraHeaders={}){
  return json(200, {ok:true, ...obj}, origin, extraHeaders);
}

export function bad(statusCode, error, origin){
  return json(statusCode, {ok:false, error}, origin);
}

export function safeParse(body){
  try { return JSON.parse(body||"{}"); } catch { return {}; }
}

export function sha256Hex(buf){
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function locForText(text, ext){
  const lines=text.split(/\r?\n/);
  let blank=0, comment=0;
  for(const l of lines){
    const s=l.trim();
    if(!s){ blank++; continue; }
    if(["mjs","js","ts","tsx"].includes(ext)){ if(s.startsWith("//")) comment++; }
    else if(ext==="sql"){ if(s.startsWith("--")) comment++; }
    else if(ext==="html"){ if(s.startsWith("<!--") || s.endsWith("-->")) comment++; }
  }
  return {lines:lines.length, blank, comment, code:Math.max(0, lines.length-blank-comment)};
}

export function excerpt(text, maxChars){
  if(text.length<=maxChars) return text;
  return text.slice(0,maxChars) + "\n/* …truncated… */";
}

export function nowISO(){ return new Date().toISOString(); }
