import AdmZip from "adm-zip";
import { ok, bad, safeParse, nowISO } from "./_util.mjs";

export async function handler(event){
  const origin = (event.headers?.origin || "").trim();
  if(event.httpMethod==="OPTIONS") return ok({}, origin);
  if(event.httpMethod!=="POST") return bad(405, "method_not_allowed", origin);

  try{
    const body = safeParse(event.body);
    const zip = new AdmZip();
    const stamp = nowISO();

    const toCSV = (rows) => {
      if(!rows || !rows.length) return "";
      const keys = Object.keys(rows[0]);
      const esc = (v) => {
        const s = String(v ?? "");
        if (/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
        return s;
      };
      const out=[keys.join(",")];
      for(const r of rows) out.push(keys.map(k=>esc(r[k])).join(","));
      return out.join("\n");
    };

    zip.addFile("README.txt", Buffer.from(
`SOL DevProof Evidence Pack
Generated: ${stamp}

Includes:
- valuation.json
- devproof_files.csv
- devproof_scorecard.csv
- devproof_controls.csv
`, "utf8"));

    zip.addFile("valuation.json", Buffer.from(JSON.stringify({
      exported_at: stamp,
      zip_name: body.zip_name,
      zip_sha256: body.zip_sha256,
      metrics: body.metrics,
      valuation: body.valuation
    }, null, 2), "utf8"));

    zip.addFile("devproof_files.csv", Buffer.from(toCSV(body.metrics?.top_files || []), "utf8"));
    zip.addFile("devproof_scorecard.csv", Buffer.from(toCSV(body.valuation?.scorecard || []), "utf8"));
    zip.addFile("devproof_controls.csv", Buffer.from(toCSV(body.valuation?.controls || []), "utf8"));

    const out = zip.toBuffer();
    return {
      statusCode: 200,
      headers:{
        "content-type":"application/zip",
        "content-disposition":"attachment; filename=devproof_evidence_pack.zip",
        "access-control-allow-origin": origin || "*",
        "access-control-allow-headers":"content-type",
        "access-control-allow-methods":"POST,OPTIONS",
        "vary":"Origin"
      },
      body: out.toString("base64"),
      isBase64Encoded: true
    };
  }catch(e){
    return bad(500, String(e.message||e), origin);
  }
}
