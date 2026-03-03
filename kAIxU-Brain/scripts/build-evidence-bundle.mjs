#!/usr/bin/env node
import { mkdirSync, copyFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = join("artifacts", `enterprise-evidence-${stamp}`);

const files = [
  "docs/enterprise/enterprise-readiness-packet.md",
  "docs/enterprise/execution-board.md",
  "docs/enterprise/trust-summary.md",
  "docs/enterprise/security-architecture-one-pager.md",
  "docs/enterprise/procurement-due-diligence-checklist.md",
  "docs/enterprise/buyer-qa-script.md",
  ".github/SECURITY.md",
  ".github/CODEOWNERS",
  ".github/dependabot.yml",
  ".github/policies/branch-protection.main.json",
  ".github/policies/branch-protection.md",
  "ops/compliance/evidence-index.md",
  "ops/compliance/control-matrix.md",
  "ops/compliance/security-questionnaire-kit.md",
  "ops/compliance/security-policy-pack.md",
  "ops/governance/owner-roster.md",
  "ops/governance/data-lifecycle.md",
  "ops/slo/slo-catalog.yaml",
  "ops/release/release-checklist.md",
  "ops/runbooks/disaster-recovery.md",
  "ops/runbooks/incident-response.md",
  "ops/runbooks/load-chaos-drill.md",
  "ops/runbooks/weekly-solo-ops.md",
  "observability/dashboards/admin-audit-dashboard.json",
  "scripts/verify-smoke.sh",
  "scripts/contract-test.mjs",
  "scripts/quality-gates.mjs",
  "scripts/generate-sbom.mjs",
  "artifacts/sbom/sbom-npm.cdx.json",
  "artifacts/sbom/sbom-summary.json",
  ".github/workflows/quality-gates.yml"
];

mkdirSync(outDir, { recursive: true });

const copied = [];
const missing = [];

for (const file of files) {
  if (!existsSync(file)) {
    missing.push(file);
    continue;
  }
  const target = join(outDir, file);
  mkdirSync(target.substring(0, target.lastIndexOf("/")), { recursive: true });
  copyFileSync(file, target);
  copied.push(file);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  outputDirectory: outDir,
  copiedCount: copied.length,
  missingCount: missing.length,
  copied,
  missing,
};

writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

if (missing.length) {
  console.warn("[evidence-bundle] generated with missing files", missing.length);
} else {
  console.log("[evidence-bundle] generated");
}

console.log(JSON.stringify(manifest, null, 2));
