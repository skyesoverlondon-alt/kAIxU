#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";

function runNpmLs() {
  const out = spawnSync("npm", ["ls", "--all", "--json"], { encoding: "utf-8" });
  if (out.status !== 0 && !out.stdout) {
    throw new Error(out.stderr || "npm ls failed");
  }
  return JSON.parse(out.stdout || "{}");
}

function flattenDeps(node, seen = new Map()) {
  if (!node || !node.dependencies) return seen;
  for (const [name, dep] of Object.entries(node.dependencies)) {
    const version = dep?.version || "unknown";
    const key = `${name}@${version}`;
    if (!seen.has(key)) {
      seen.set(key, {
        type: "library",
        name,
        version,
        purl: `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`,
      });
    }
    flattenDeps(dep, seen);
  }
  return seen;
}

function buildCycloneDx(root) {
  const name = root?.name || "kaixu-brain-openai-worker";
  const version = root?.version || "0.0.0";
  const components = Array.from(flattenDeps(root).values());
  const bomRef = `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;

  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: {
        type: "application",
        name,
        version,
        bomRef,
      },
      tools: [
        {
          vendor: "Skyes Over London",
          name: "sbom-generator",
          version: "1.0.0",
        },
      ],
    },
    components,
  };
}

function main() {
  const npmTree = runNpmLs();
  const sbom = buildCycloneDx(npmTree);

  mkdirSync("artifacts/sbom", { recursive: true });
  writeFileSync("artifacts/sbom/sbom-npm.cdx.json", JSON.stringify(sbom, null, 2));
  writeFileSync(
    "artifacts/sbom/sbom-summary.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        componentCount: sbom.components.length,
        rootComponent: sbom.metadata?.component,
      },
      null,
      2,
    ),
  );

  console.log(`[sbom] generated artifacts/sbom/sbom-npm.cdx.json (${sbom.components.length} components)`);
}

try {
  main();
} catch (error) {
  console.error("[sbom] FAIL", error?.message || error);
  process.exit(1);
}
