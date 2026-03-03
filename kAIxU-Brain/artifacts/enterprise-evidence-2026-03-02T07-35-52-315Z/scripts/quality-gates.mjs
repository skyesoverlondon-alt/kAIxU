#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const staticOnly = process.argv.includes("--static-only") || process.env.KAIXU_STATIC_ONLY === "1";

const requiredFiles = [
  "docs/enterprise/README.md",
  "docs/enterprise/01-reliability-slos.md",
  "docs/enterprise/02-rbac-sso.md",
  "docs/enterprise/03-observability.md",
  "docs/enterprise/04-security-compliance.md",
  "docs/enterprise/05-ci-cd-quality-gates.md",
  "docs/enterprise/06-contract-testing.md",
  "docs/enterprise/07-release-strategy.md",
  "docs/enterprise/08-backup-dr.md",
  "docs/enterprise/09-incident-response.md",
  "docs/enterprise/10-data-governance.md",
  "docs/enterprise/11-admin-audit-dashboards.md",
  "docs/enterprise/12-load-chaos-drills.md",
  "ops/slo/slo-catalog.yaml",
  "ops/compliance/control-matrix.md",
  "ops/runbooks/disaster-recovery.md",
  "ops/runbooks/incident-response.md",
  "ops/runbooks/load-chaos-drill.md",
  "ops/release/release-checklist.md",
  "ops/governance/data-lifecycle.md",
  "observability/dashboards/admin-audit-dashboard.json",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args) {
  const out = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (out.status !== 0) {
    throw new Error(`command failed: ${command} ${args.join(" ")}`);
  }
}

function checkFiles() {
  const missing = requiredFiles.filter((f) => !existsSync(f));
  assert(missing.length === 0, `missing required files: ${missing.join(", ")}`);
  console.log(`[quality-gates] file-check PASS (${requiredFiles.length} files)`);
}

function main() {
  checkFiles();

  if (staticOnly) {
    console.log("[quality-gates] static-only mode enabled");
    console.log("[quality-gates] PASS");
    return;
  }

  run("npm", ["run", "smoke:verify"]);
  run("npm", ["run", "contract:test"]);

  console.log("[quality-gates] PASS");
}

try {
  main();
} catch (error) {
  console.error("[quality-gates] FAIL", error?.message || error);
  process.exit(1);
}
