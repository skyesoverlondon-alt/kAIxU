import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";
import { ok, bad, safeParse } from "./_util.mjs";

function fmtMoney(n){ try{ return "$"+Number(n).toLocaleString("en-US"); }catch{ return "$"+n; } }

function wrap(text, maxWidth, font, size){
  const words = String(text||"").replace(/\r/g,"").split(/\s+/);
  const lines=[]; let line="";
  for(const w of words){
    const test = line ? (line + " " + w) : w;
    const width = font.widthOfTextAtSize(test, size);
    if(width <= maxWidth){ line = test; }
    else { if(line) lines.push(line); line = w; }
  }
  if(line) lines.push(line);
  return lines;
}

export async function handler(event){
  const origin = (event.headers?.origin || "").trim();
  if(event.httpMethod==="OPTIONS") return ok({}, origin);
  if(event.httpMethod!=="POST") return bad(405, "method_not_allowed", origin);

  try{
    const body = safeParse(event.body);
    const cf = body.certificate_fields || {};
    const v = body.valuation || {};

    const logoBytes = fs.readFileSync(path.join(process.cwd(), "assets/SKYESOVERLONDONDIETYLOGO.png"));
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612,792]);
    const { width, height } = page.getSize();

    const BG = rgb(0.03,0.01,0.10);
    const GOLD = rgb(0.96,0.82,0.55);
    const INK = rgb(0.92,0.95,1.00);
    const MUTED = rgb(0.66,0.70,0.84);

    page.drawRectangle({x:0,y:0,width,height,color:BG});
    page.drawRectangle({x:0,y:height-52,width,height:52,color:rgb(0.08,0.04,0.16)});

    const logoImg = await pdfDoc.embedPng(logoBytes);
    const logoDims = logoImg.scale(0.12);
    page.drawImage(logoImg, {x:42,y:height-46,width:logoDims.width,height:logoDims.height});

    const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    page.drawText("Skyes Over London LC", {x:120,y:height-28,size:14,font:fontB,color:GOLD});
    page.drawText("SOL DevProof Lab | Valuation Certificate", {x:120,y:height-44,size:10,font,color:INK});

    page.drawText("Valuation Certificate", {x:42,y:height-100,size:26,font:fontB,color:GOLD});

    const certNo = cf.certificate_no || "SOL-DPL-YYYY-#####";
    const issueDate = cf.issue_date || new Date().toISOString().slice(0,10);
    page.drawText(`Certificate No: ${certNo}`, {x:42,y:height-128,size:11,font,color:INK});
    page.drawText(`Issue Date: ${issueDate}`, {x:310,y:height-128,size:11,font,color:INK});

    const left=42, top=height-160, col1=190, col2=width-42, rowH=38;
    const rows = [
      ["Client / Product", cf.client_product || "______________________________"],
      ["Repository / Version", cf.repository_version || "______________________________"],
      ["Assessment Date", cf.assessment_date || issueDate],
      ["Scope", cf.scope || "Reviewed components, environments, exclusions"],
      ["Readiness Scorecard", cf.readiness_scorecard || "Security, Reliability, Performance, Maintainability, Compliance posture"],
      ["Key Strengths", cf.key_strengths || "• ____________________\n• ____________________"],
      ["Required Hardening", cf.required_hardening || "P0: ____________________\nP1: ____________________\nP2: ____________________"],
      ["Valuation Range (USD)", cf.valuation_range_usd || `${fmtMoney(v.appraised_low_usd||0)} to ${fmtMoney(v.appraised_high_usd||0)}`],
      ["Methodology Summary", cf.methodology_summary || "Replacement cost + completion budget + risk adjustment"],
      ["Signatory", cf.signatory || "Skyes Over London LC | SOL DevProof Lab | Authorized Reviewer"],
    ];

    let y=top;
    for(const [k,val] of rows){
      page.drawRectangle({x:left,y:y-rowH,width:col2-left,height:rowH,color:rgb(0,0,0),opacity:0.18});
      page.drawLine({start:{x:left,y:y-rowH}, end:{x:col2,y:y-rowH}, thickness:1, color:rgb(1,1,1), opacity:0.12});
      page.drawLine({start:{x:left+col1,y:y}, end:{x:left+col1,y:y-rowH}, thickness:1, color:rgb(1,1,1), opacity:0.10});

      page.drawText(k, {x:left+10, y:y-24, size:11, font:fontB, color:INK});
      const maxW = col2-(left+col1)-14;
      const lines = wrap(String(val||""), maxW, font, 10.5);
      let ty=y-18;
      for(const line of lines.slice(0,3)){
        page.drawText(line, {x:left+col1+10, y:ty, size:10.5, font, color:INK});
        ty -= 12;
      }
      y -= rowH;
      if(y < 160) break;
    }

    page.drawText("Terms (plain-English)", {x:42,y:128,size:13,font:fontB,color:GOLD});
    const terms = [
      "• This certificate is an appraisal based on observed behavior, evidence artifacts, and stated assumptions. It is not a warranty or guarantee.",
      "• Client retains full IP and creative control. Optional patch work is delivered via PRs or versioned ZIP; client approves merges.",
      "• Third-party integrations may affect readiness outcomes."
    ];
    let ty=110;
    for(const t of terms){
      const ls = wrap(t, width-84, font, 9.5);
      for(const l of ls){
        page.drawText(l, {x:42,y:ty,size:9.5,font,color:MUTED});
        ty -= 12;
      }
    }

    page.drawLine({start:{x:42,y:44}, end:{x:width-42,y:44}, thickness:1, color:rgb(1,1,1), opacity:0.12});
    page.drawText("Confidential | Client retains full IP and creative control | SOLEnterprises.org", {x:42,y:28,size:9,font,color:MUTED});
    page.drawText("Support: SkyesOverLondonLC@solenterprises.org | +1 (480) 469-5416", {x:42,y:15,size:9,font,color:MUTED});

    const pdfBytes = await pdfDoc.save();
    return {
      statusCode: 200,
      headers:{
        "content-type":"application/pdf",
        "content-disposition":"attachment; filename=valuation_certificate.pdf",
        "access-control-allow-origin": origin || "*",
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "POST,OPTIONS",
        "vary":"Origin"
      },
      body: Buffer.from(pdfBytes).toString("base64"),
      isBase64Encoded: true
    };
  }catch(e){
    return bad(500, String(e.message||e), origin);
  }
}
