#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function run(command, args) {
  const out = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (out.status !== 0) {
    throw new Error(`command failed: ${command} ${args.join(" ")}`);
  }
}

function main() {
  console.log("[weekly-ops] starting weekly 15-minute routine");
  run("npm", ["run", "quality:gates"]);
  console.log("[weekly-ops] quality gates PASS");
  console.log("[weekly-ops] next manual checks:");
  console.log("- review ops/release/release-checklist.md");
  console.log("- review ops/compliance/control-matrix.md");
  console.log("- review ops/governance/owner-roster.md");
  console.log("- review ops/runbooks/load-chaos-drill.md");
  console.log("- review ops/runbooks/disaster-recovery.md");
  console.log("[weekly-ops] PASS");
}

try {
  main();
} catch (error) {
  console.error("[weekly-ops] FAIL", error?.message || error);
  process.exit(1);
}
