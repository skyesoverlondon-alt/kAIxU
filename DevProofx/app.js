
(function(){
  const show = (msg, stack) => {
    try{
      const b = document.getElementById("jsCrashBanner");
      const d = document.getElementById("jsCrashDetails");
      if(!b || !d) return;
      const payload = { time: new Date().toISOString(), message: String(msg||""), stack: String(stack||"") };
      d.textContent = JSON.stringify(payload, null, 2);
      b.style.display = "block";
      const copyBtn = document.getElementById("btnCopyCrash");
      if(copyBtn) copyBtn.onclick = ()=> navigator.clipboard.writeText(d.textContent||"").then(()=>alert("Copied ✅"));
      const dis = document.getElementById("btnDismissCrash");
      if(dis) dis.onclick = ()=>{ b.style.display="none"; };
    }catch{}
  };
  window.addEventListener("error", (e)=>{
    show(e?.message || "Script error", e?.error?.stack || "");
  });
  window.addEventListener("unhandledrejection", (e)=>{
    const r = e?.reason;
    show((r?.message)||String(r||"Unhandled rejection"), r?.stack || "");
  });
  window.__DP_BOOT_OK=false;
  setTimeout(()=>{ if(!window.__DP_BOOT_OK) show("Initialization watchdog: app did not reach READY state",""); }, 2500);
})();

const $ = (id) => document.getElementById(id);

const state = { zipName:null, zipSha256:null, metrics:null, valuation:null };

function setStatus(kind, text){
  const pill = $("statusPill");
  const dot = pill.querySelector(".dot");
  dot.className = "dot " + (kind==="ok"?"ok":kind==="bad"?"bad":"warn");
  pill.querySelector("span:last-child").textContent = text;
}

async function sha256(buf){
  const hash = await crypto.subtle.digest("SHA-256", buf);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map(b=>b.toString(16).padStart(2,"0")).join("");
}

function download(name, blob){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 8000);
}

function bytes(n){
  const u=["B","KB","MB","GB"];
  let i=0, x=n;
  while(x>=1024 && i<u.length-1){ x/=1024; i++; }
  return `${x.toFixed(i?1:0)} ${u[i]}`;
}

function toCSV(rows){
  const esc = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
    return s;
  };
  const keys = Object.keys(rows[0] || {});
  const out = [keys.join(",")];
  for(const r of rows) out.push(keys.map(k=>esc(r[k])).join(","));
  return out.join("\n");
}

function renderTable(el, cols, rows){
  if(!rows || !rows.length){ el.innerHTML = ""; return; }
  const th = cols.map(c=>`<th>${c.label}</th>`).join("");
  const tb = rows.map(r=>`<tr>` + cols.map(c=>`<td>${c.render?c.render(r[c.key], r):(r[c.key]??"")}</td>`).join("") + `</tr>`).join("");
  el.innerHTML = `<thead><tr>${th}</tr></thead><tbody>${tb}</tbody>`;
}

function drawBarChart(canvas, labels, values, opts={}){
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio||1;
  const w = canvas.width = canvas.clientWidth * dpr;
  const h = canvas.height = (parseInt(canvas.getAttribute("height")||"180",10)) * dpr;
  ctx.clearRect(0,0,w,h);

  const padL = 44*dpr, padR = 10*dpr, padT = 10*dpr, padB = 34*dpr;
  const max = Math.max(...values, 1);
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  ctx.strokeStyle = "rgba(255,255,255,.18)";
  ctx.lineWidth = 1*dpr;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT+innerH);
  ctx.lineTo(padL+innerW, padT+innerH);
  ctx.stroke();

  ctx.fillStyle = "rgba(236,241,255,.75)";
  ctx.font = `${11*dpr}px ui-monospace, Menlo, Monaco, Consolas, monospace`;
  for(let t=0;t<=4;t++){
    const y = padT + innerH - (t/4)*innerH;
    const val = (t/4)*max;
    ctx.fillText(opts.formatY?opts.formatY(val):Math.round(val).toString(), 2*dpr, y+4*dpr);
    ctx.strokeStyle = "rgba(255,255,255,.07)";
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL+innerW, y); ctx.stroke();
  }

  const n = values.length;
  const gap = 8*dpr;
  const bw = Math.max(8*dpr, (innerW - gap*(n-1))/n);
  for(let i=0;i<n;i++){
    const x = padL + i*(bw+gap);
    const bh = (values[i]/max) * innerH;
    const y = padT + innerH - bh;
    ctx.fillStyle = opts.fill || "rgba(246,209,139,.28)";
    ctx.strokeStyle = "rgba(246,209,139,.55)";
    ctx.fillRect(x, y, bw, bh);
    ctx.strokeRect(x, y, bw, bh);

    ctx.save();
    ctx.translate(x + bw/2, padT+innerH + 18*dpr);
    ctx.rotate(-0.5);
    ctx.fillStyle = "rgba(236,241,255,.75)";
    ctx.font = `${10*dpr}px ui-monospace, Menlo, Monaco, Consolas, monospace`;
    const s = labels[i].length>18 ? labels[i].slice(0,18)+"…" : labels[i];
    ctx.fillText(s, -ctx.measureText(s).width/2, 0);
    ctx.restore();
  }
}

async function api(path, body){
  const res = await fetch(`/api${path}`, {method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(body)});
  const data = await res.json().catch(()=>({}));
  if(!res.ok || data.ok===false) throw new Error(data.error || `HTTP_${res.status}`);
  return data;
}

function setTab(name){
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active", t.dataset.tab===name));
  document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active", p.id===`panel-${name}`));
}

document.addEventListener("click", (e)=>{ const t = e.target.closest(".tab"); if(t) setTab(t.dataset.tab); });

$("btnNew").addEventListener("click", ()=>{
  $("zipFile").value=""; $("notes").value=""; $("narrative").value=""; $("certJson").value=""; $("exportLog").value="";
  $("btnRun").disabled=true; $("btnCert").disabled=true;
  $("btnExportJSON").disabled=true; $("btnExportCSV").disabled=true; $("btnExportAll").disabled=true;
  state.zipName=null; state.zipSha256=null; state.metrics=null; state.valuation=null;
  ["kFiles","kLines","kCode","kSha","kRepl","kComp","kRange","kAvg"].forEach(id=>$(id).textContent="—");
  renderTable($("tblFiles"),[],[]); renderTable($("tblScores"),[],[]); renderTable($("tblControls"),[],[]);
  setStatus("warn","Ready");
});

$("zipFile").addEventListener("change", async ()=>{
  const f = $("zipFile").files[0];
  if(!f) return;
  setStatus("warn","Hashing ZIP…");
  const buf = await f.arrayBuffer();
  state.zipSha256 = await sha256(buf);
  state.zipName = f.name;
  $("kSha").textContent = state.zipSha256.slice(0,16)+"…";
  $("btnRun").disabled=false;
  setStatus("ok","ZIP loaded");
});

$("btnRun").addEventListener("click", async ()=>{
  const f = $("zipFile").files[0];
  if(!f) return;
  try{
    setStatus("warn","Uploading + scanning…");
    const buf = await f.arrayBuffer();
    const b64 = arrayBufferToBase64(buf);
    const r = await api("/valuate", {
      zip_name: f.name,
      zip_sha256: state.zipSha256,
      zip_b64: b64,
      mode: $("mode").value,
      model: $("model").value,
      notes: $("notes").value||""
    });

    state.metrics = r.data.metrics;
    state.valuation = r.data.valuation;

    $("kFiles").textContent = state.metrics.file_count;
    $("kLines").textContent = state.metrics.total_lines.toLocaleString();
    $("kCode").textContent = state.metrics.code_lines.toLocaleString();

    const top = (state.metrics.top_files||[]).slice(0,10);
    drawBarChart($("chartSizes"), top.map(x=>x.file), top.map(x=>x.bytes), {formatY:(v)=>bytes(v)});
    drawBarChart($("chartLoc"), top.map(x=>x.file), top.map(x=>x.code_lines), {formatY:(v)=>Math.round(v).toString()});

    renderTable($("tblFiles"),
      [{key:"file",label:"File"},{key:"bytes",label:"Bytes",render:(v)=>bytes(v)},{key:"lines",label:"Lines"},{key:"code_lines",label:"Code"}],
      top
    );

    renderTable($("tblScores"),
      [{key:"category",label:"Category"},{key:"score",label:"Score"},{key:"notes",label:"Notes"}],
      state.valuation.scorecard||[]
    );
    renderTable($("tblControls"),
      [{key:"control",label:"Control"},{key:"status",label:"Status"}],
      state.valuation.controls||[]
    );

    const sc = state.valuation.scorecard||[];
    drawBarChart($("chartScores"), sc.map(x=>x.category), sc.map(x=>x.score), {formatY:(v)=>Math.round(v).toString()});
    const ctr = state.valuation.controls||[];
    const yes = ctr.filter(x=>String(x.status).toUpperCase()==="YES").length;
    const no = ctr.length - yes;
    drawBarChart($("chartControls"), ["YES","NO"], [yes,no], {formatY:(v)=>Math.round(v).toString(), fill:"rgba(124,60,255,.22)"});

    const v = state.valuation.valuation;
    $("kRepl").textContent = `${v.replacement_cost_low_usd.toLocaleString()} – ${v.replacement_cost_high_usd.toLocaleString()}`;
    $("kComp").textContent = `${v.completion_budget_low_usd.toLocaleString()} – ${v.completion_budget_high_usd.toLocaleString()}`;
    $("kRange").textContent = `${v.appraised_low_usd.toLocaleString()} – ${v.appraised_high_usd.toLocaleString()}`;
    $("kAvg").textContent = `${v.avg_readiness_score}/100`;

    drawBarChart($("chartValue"),
      ["Replacement (low)","Replacement (high)","Appraised (low)","Appraised (high)"],
      [v.replacement_cost_low_usd, v.replacement_cost_high_usd, v.appraised_low_usd, v.appraised_high_usd],
      {formatY:(x)=>`$${Math.round(x/1000)}k`}
    );
    const hours = v.hours||{};
    const keys = Object.keys(hours).slice(0,10);
    drawBarChart($("chartHours"), keys, keys.map(k=>hours[k]||0), {formatY:(x)=>Math.round(x).toString(), fill:"rgba(255,43,214,.14)"});

    $("narrative").value = state.valuation.narrative||"";
    $("certJson").value = JSON.stringify(state.valuation.certificate_fields||{}, null, 2);

    $("btnCert").disabled=false; $("btnExportJSON").disabled=false; $("btnExportCSV").disabled=false; $("btnExportAll").disabled=false;

    setStatus("ok","Valuation complete");
    setTab("valuation");
  }catch(e){
    console.error(e);
    setStatus("bad","Failed");
    alert("Valuation failed: " + e.message);
  }
});

$("btnCert").addEventListener("click", async ()=>{
  try{
    if(!state.valuation) return;
    setStatus("warn","Generating certificate…");
    const res = await fetch("/api/cert", {
      method:"POST",
      headers:{"content-type":"application/json"},
      body: JSON.stringify({
        certificate_fields: state.valuation.certificate_fields,
        valuation: state.valuation.valuation,
        zip_sha256: state.zipSha256,
        zip_name: state.zipName
      })
    });
    if(!res.ok) throw new Error("certificate_failed");
    const blob = await res.blob();
    download(`SOL_Valuation_Certificate_${(state.zipName||"build").replace(/[^a-z0-9]+/ig,"_")}.pdf`, blob);
    setStatus("ok","Certificate exported");
    $("certMsg").textContent="Certificate exported.";
  }catch(e){
    setStatus("bad","Cert failed");
    alert("Certificate failed: " + e.message);
  }
});

$("btnExportJSON").addEventListener("click", ()=>{
  download("devproof_valuation.json", new Blob([JSON.stringify({zip_name:state.zipName, zip_sha256:state.zipSha256, metrics:state.metrics, valuation:state.valuation, exported_at:new Date().toISOString()}, null, 2)], {type:"application/json"}));
  $("exportLog").value += "[JSON] Exported devproof_valuation.json\n";
});

$("btnExportCSV").addEventListener("click", ()=>{
  download("devproof_files.csv", new Blob([toCSV(state.metrics?.top_files||[])], {type:"text/csv"}));
  download("devproof_scorecard.csv", new Blob([toCSV(state.valuation?.scorecard||[])], {type:"text/csv"}));
  download("devproof_controls.csv", new Blob([toCSV(state.valuation?.controls||[])], {type:"text/csv"}));
  $("exportLog").value += "[CSV] Exported devproof_files.csv, devproof_scorecard.csv, devproof_controls.csv\n";
});

$("btnExportAll").addEventListener("click", async ()=>{
  try{
    setStatus("warn","Building evidence pack…");
    const res = await fetch("/api/evidence", {method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({zip_name:state.zipName, zip_sha256:state.zipSha256, metrics:state.metrics, valuation:state.valuation})});
    if(!res.ok) throw new Error("evidence_failed");
    const blob = await res.blob();
    download("devproof_evidence_pack.zip", blob);
    $("exportLog").value += "[ZIP] Exported devproof_evidence_pack.zip\n";
    setStatus("ok","Evidence exported");
  }catch(e){
    setStatus("bad","Export failed");
    alert("Evidence pack failed: " + e.message);
  }
});


try{ window.__DP_BOOT_OK = true; }catch{}



let _diagClicks=0, _diagTimer=null, _k6=false, _k7=false;
document.addEventListener("keydown",(e)=>{ if(e.key==="6") _k6=true; if(e.key==="7") _k7=true; });
document.addEventListener("keyup",(e)=>{ if(e.key==="6") _k6=false; if(e.key==="7") _k7=false; });

function openDiag(on){
  const ov=$("diagOverlay");
  if(ov) ov.style.display = on ? "block":"none";
}
function diagSet(obj){
  const out=$("diagOut");
  if(out) out.value = JSON.stringify(obj, null, 2);
}
async function diagRunAll(){
  const rep={ time:new Date().toISOString(), url:location.href, ua:navigator.userAgent, checks:{} };
  try{ const r=await fetch("/api/health"); rep.checks.health={ok:r.ok,status:r.status,body:await r.json().catch(()=>({}))}; }catch(e){ rep.checks.health={ok:false,error:String(e)}; }
  try{ const r=await fetch("/api/me"); rep.checks.me={ok:r.ok,status:r.status,body:await r.json().catch(()=>({}))}; }catch(e){ rep.checks.me={ok:false,error:String(e)}; }
  rep.hints={ run_button:"Must select ZIP; button enables after hashing completes.", zip_b64:"Chunked base64 encoder enabled." };
  diagSet(rep); return rep;
}
document.addEventListener("click",(e)=>{
  const logo=$("appLogo");
  if(logo && (e.target===logo || logo.contains(e.target))){
    if(!(_k6 && _k7)) return;
    _diagClicks++;
    if(_diagTimer) clearTimeout(_diagTimer);
    _diagTimer=setTimeout(()=>{ _diagClicks=0; }, 900);
    if(_diagClicks>=3){ _diagClicks=0; openDiag(true); diagRunAll(); }
  }
  if(e.target && e.target.id==="btnDiagClose") openDiag(false);
  if(e.target && e.target.id==="btnDiagRun") diagRunAll();
  if(e.target && e.target.id==="btnDiagCopy"){
    const out=$("diagOut"); if(out) navigator.clipboard.writeText(out.value||"").then(()=>alert("Diagnostics copied ✅"));
  }
  const act=e.target?.getAttribute?.("data-diag-action");
  if(act==="health") fetch("/api/health").then(r=>r.json()).then(j=>diagSet({health:j,time:new Date().toISOString()})).catch(err=>diagSet({error:String(err)}));
  if(act==="me") fetch("/api/me").then(r=>r.json()).then(j=>diagSet({me:j,time:new Date().toISOString()})).catch(err=>diagSet({error:String(err)}));
  if(act==="env") diagSet({ env:{ cookieEnabled:navigator.cookieEnabled, origin:location.origin }, note:"If 403/CSRF, check ORIGIN_ALLOWLIST + cookies." });
});
