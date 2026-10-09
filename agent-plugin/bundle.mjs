// Bundles this plugin into fully self-contained command files under dist/,
// inlining every @mirrorcap/* workspace package plus ethers and
// @kuru-labs/kuru-sdk — none of which exist on the public npm registry, so a
// real `npm install` of a published, un-bundled version of this plugin would
// fail for everyone. Only the host-provided @metamask/agent-wallet plugin
// SDK stays external (it's provided by the `mm` CLI itself at runtime).
import { build } from "esbuild";
import { globSync } from "node:fs";
import path from "node:path";

const entryPoints = [
  "src/index.ts",
  ...globSync("src/commands/**/*.ts"),
];

await build({
  entryPoints,
  outdir: "dist",
  outbase: "src",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  external: ["@metamask/agent-wallet", "@metamask/agent-wallet/plugin"],
  sourcemap: false,
  logLevel: "info",
  // Bundled CJS deps (ethers, @kuru-labs/kuru-sdk) call require("crypto") etc.
  // internally; ESM has no global `require`, so provide one via Node's
  // module.createRequire. Standard fix for esbuild CJS->ESM bundling.
  banner: {
    js: "import { createRequire as __mirrorcapCreateRequire } from 'node:module'; const require = __mirrorcapCreateRequire(import.meta.url);",
  },
});

console.log("Bundled", entryPoints.length, "entry points into dist/ (self-contained, no workspace deps).");
