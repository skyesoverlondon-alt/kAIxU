import AdmZip from "adm-zip";
import { ok, bad, safeParse, sha256Hex, locForText, excerpt } from "./_util.mjs";

const KAIXU_GATE_URL     = (process.env.KAIXU_GATE_URL || "https://kaixu67.skyesoverlondon.workers.dev").replace(/\/+$/, "");
const KAIXU_MODEL_DEFAULT = process.env.KAIXU_DEFAULT_MODEL || "kAIxU6.7-pro";

function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }

async function callKaixu({model, input, schema}){
  const token = process.env.KAIXU_GATE_TOKEN;
  if(!token) throw new Error("missing_KAIXU_GATE_TOKEN");

  // Convert role/content input array to kAIxU gate messages format.
  // Inject schema into the system message so the model knows the exact shape expected.
  const messages = input.map((m, i) => {
    const text = Array.isArray(m.content)
      ? m.content.map(p => p.text || "").join("")
      : String(m.content || "");
    // Append schema as instructions to system message
    if(m.role === "system" || i === 0){
      return {
        role: "system",
        content: text + "\n\nYou MUST return ONLY valid JSON that strictly matches this schema — no markdown, no commentary, raw JSON only:\n" + JSON.stringify(schema, null, 2)
      };
    }
    return { role: m.role === "assistant" ? "assistant" : "user", content: text };
  });

  const res = await fetch(`${KAIXU_GATE_URL}/v1/generate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      messages,
      output: { format: "json" },
    }),
  });

  if(!res.ok){
    const t = await res.text().catch(() => "");
    throw new Error(`kaixu_gate_error_${res.status}: ${t.slice(0, 240)}`);
  }

  const data = await res.json();
  if(!data.ok) throw new Error(`kaixu_gate_error: ${data.error || JSON.stringify(data)}`);

  try {
    return JSON.parse(data.text);
  } catch {
    throw new Error(`kaixu_response_not_json: ${String(data.text || "").slice(0, 240)}`);
  }
}

export async function handler(event){
  const origin = (event.headers?.origin || "").trim();
  if(event.httpMethod==="OPTIONS") return ok({}, origin);
  if(event.httpMethod!=="POST") return bad(405, "method_not_allowed", origin);

  try{
    const body = safeParse(event.body);
    const zipB64 = body.zip_b64;
    if(!zipB64) return bad(400, "missing_zip_b64", origin);

    const zipBuf = Buffer.from(zipB64, "base64");
    const computedSha = sha256Hex(zipBuf);
    const providedSha = (body.zip_sha256||"").toLowerCase();
    if(providedSha && providedSha !== computedSha) return bad(400, "zip_sha_mismatch", origin);

    const zip = new AdmZip(zipBuf);
    const entries = zip.getEntries().filter(e=>!e.isDirectory);

    const files=[];
    let totalLines=0, totalCode=0;
    const extsWorthLoc = new Set(["js","mjs","ts","tsx","html","css","sql","py","go","java","cs","rb","php","rs","cpp","c","h","md","yml","yaml","toml","json"]);
    const take = entries.slice(0, 4000);

    for(const e of take){
      const name=e.entryName;
      const bytes = e.header.size || e.getData().length;
      const ext = (name.split(".").pop()||"").toLowerCase();
      let lines=0, code=0;
      if(extsWorthLoc.has(ext)){
        let txt=""; try{ txt=e.getData().toString("utf8"); }catch{}
        const loc = locForText(txt, ext);
        lines=loc.lines; code=loc.code;
        totalLines += lines; totalCode += code;
      }
      files.push({file:name, bytes, ext, lines, code_lines:code});
    }

    files.sort((a,b)=>b.bytes-a.bytes);
    const topFiles = files.slice(0, 20);

    const has = (pat)=> files.some(f=>f.file.toLowerCase().includes(pat));
    const controls = [
      {control:"CI workflows", status: has(".github/workflows") ? "YES":"NO"},
      {control:"CodeQL", status: has("codeql") ? "YES":"NO"},
      {control:"Secret scanning", status: (has("gitleaks")||has("secret")) ? "YES":"NO"},
      {control:"Lockfile", status: files.some(f=>f.file.endsWith("package-lock.json")||f.file.endsWith("pnpm-lock.yaml")||f.file.endsWith("yarn.lock")) ? "YES":"NO"},
      {control:"SBOM", status: (has("sbom")||has("cyclonedx")) ? "YES":"NO"},
      {control:"Security policy", status: files.some(f=>f.file.toUpperCase().endsWith("SECURITY.MD")) ? "YES":"NO"},
      {control:"Netlify functions", status: files.some(f=>f.file.startsWith("netlify/functions/")) ? "YES":"NO"},
    ];

    const metrics = {
      zip_name: body.zip_name || "upload.zip",
      zip_sha256: computedSha,
      file_count: files.length,
      total_lines: totalLines,
      code_lines: totalCode,
      top_files: topFiles,
      controls
    };

    const mode = body.mode==="full_context" ? "full_context" : "local_only";
    const notes = String(body.notes||"");
    const model = body.model || KAIXU_MODEL_DEFAULT;

    let excerpts = [];
    if(mode==="full_context"){
      for(const f of topFiles.slice(0,6)){
        try{
          const ent = zip.getEntry(f.file);
          if(!ent) continue;
          const txt = ent.getData().toString("utf8");
          excerpts.push({file:f.file, ext:f.ext, excerpt: excerpt(txt, 4000)});
        }catch{}
      }
    }

    const schema = {
      type:"object",
      additionalProperties:false,
      properties:{
        scorecard:{type:"array", items:{type:"object", additionalProperties:false, properties:{
          category:{type:"string"}, score:{type:"integer", minimum:0, maximum:100}, notes:{type:"string"}
        }, required:["category","score","notes"]}},
        controls:{type:"array", items:{type:"object", additionalProperties:false, properties:{control:{type:"string"}, status:{type:"string"}}, required:["control","status"]}},
        valuation:{type:"object", additionalProperties:false, properties:{
          avg_readiness_score:{type:"integer", minimum:0, maximum:100},
          replacement_cost_low_usd:{type:"integer", minimum:0},
          replacement_cost_high_usd:{type:"integer", minimum:0},
          completion_budget_low_usd:{type:"integer", minimum:0},
          completion_budget_high_usd:{type:"integer", minimum:0},
          appraised_low_usd:{type:"integer", minimum:0},
          appraised_high_usd:{type:"integer", minimum:0},
          hours:{type:"object"},
          assumptions:{type:"array", items:{type:"string"}}
        }, required:["avg_readiness_score","replacement_cost_low_usd","replacement_cost_high_usd","completion_budget_low_usd","completion_budget_high_usd","appraised_low_usd","appraised_high_usd","hours","assumptions"]},
        narrative:{type:"string"},
        certificate_fields:{type:"object", additionalProperties:false, properties:{
          certificate_no:{type:"string"},
          issue_date:{type:"string"},
          client_product:{type:"string"},
          repository_version:{type:"string"},
          assessment_date:{type:"string"},
          scope:{type:"string"},
          readiness_scorecard:{type:"string"},
          key_strengths:{type:"string"},
          required_hardening:{type:"string"},
          valuation_range_usd:{type:"string"},
          methodology_summary:{type:"string"},
          signatory:{type:"string"}
        }, required:["certificate_no","issue_date","client_product","repository_version","assessment_date","scope","readiness_scorecard","key_strengths","required_hardening","valuation_range_usd","methodology_summary","signatory"]}
      },
      required:["scorecard","controls","valuation","narrative","certificate_fields"]
    };

    const baseHours = {
      "Front-end engineering": clamp(Math.round(metrics.code_lines/18), 60, 420),
      "Back-end/API engineering": clamp(Math.round(metrics.code_lines/22), 60, 520),
      "DB/schema + security controls": clamp(Math.round(metrics.code_lines/40), 30, 260),
      "QA + security review": clamp(Math.round(metrics.code_lines/35), 30, 320),
      "Docs + delivery tooling": clamp(Math.round(metrics.code_lines/90), 12, 140),
    };

    const input = [
      {role:"system", content:[{type:"text", text:
`You are SOL DevProof Lab's valuation engine. Return conservative, evidence-based output.
- Return JSON exactly matching the schema.
- Use supplied metrics + control signals. If mode=local_only, do not claim to have read code.
- Be brutally honest: list P0/P1/P2 risks and price impact.
- Include replacement cost + completion budget + appraised range with readiness/risk adjustment.
- Narrative must be dev-boring: concrete, not hype.`}]},
      {role:"user", content:[{type:"text", text: JSON.stringify({
        mode,
        product: metrics.zip_name,
        zip_sha256: metrics.zip_sha256,
        file_count: metrics.file_count,
        total_lines: metrics.total_lines,
        code_lines: metrics.code_lines,
        controls,
        top_files: topFiles.map(f=>({file:f.file, bytes:f.bytes, ext:f.ext, lines:f.lines, code_lines:f.code_lines})),
        notes,
        baseline_hours: baseHours,
        rates_usd_per_hour: {mid:120, high:170}
      })}]}
    ];
    if(mode==="full_context" && excerpts.length){
      input.push({role:"user", content:[{type:"text", text:"Code excerpts (limited): "+JSON.stringify(excerpts)}]});
    }

    const ai = await callKaixu({model, input, schema});
    ai.controls = controls;

    return ok({data:{metrics, valuation: ai}}, origin);
  }catch(e){
    return bad(500, String(e.message||e), origin);
  }
}
