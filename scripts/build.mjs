#!/usr/bin/env node
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");

const entryPoints = {
  "background/service-worker": join(root, "src/background/service-worker.ts"),
  "content/claude": join(root, "src/content/claude.ts"),
  "ui/popup/popup": join(root, "src/ui/popup/popup.ts"),
  "ui/sidepanel/sidepanel": join(root, "src/ui/sidepanel/sidepanel.ts"),
  "ui/options/options": join(root, "src/ui/options/options.ts"),
};

function copyStatic() {
  mkdirSync(dist, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  writeFileSync(join(dist, "manifest.json"), JSON.stringify(manifest, null, 2));

  for (const dir of ["ui/popup", "ui/sidepanel", "ui/options"]) {
    mkdirSync(join(dist, dir), { recursive: true });
  }
  cpSync(join(root, "src/ui/popup/popup.html"), join(dist, "ui/popup/popup.html"));
  cpSync(join(root, "src/ui/popup/popup.css"), join(dist, "ui/popup/popup.css"));
  cpSync(join(root, "src/ui/sidepanel/sidepanel.html"), join(dist, "ui/sidepanel/sidepanel.html"));
  cpSync(join(root, "src/ui/sidepanel/sidepanel.css"), join(dist, "ui/sidepanel/sidepanel.css"));
  cpSync(join(root, "src/ui/options/options.html"), join(dist, "ui/options/options.html"));
  cpSync(join(root, "src/ui/options/options.css"), join(dist, "ui/options/options.css"));
  cpSync(join(root, "public"), join(dist), { recursive: true });
}

const shared = {
  entryPoints,
  bundle: true,
  outdir: dist,
  entryNames: "[dir]/[name]",
  format: "esm",
  target: ["chrome120"],
  sourcemap: true,
  logLevel: "info",
};

async function run() {
  rmSync(dist, { recursive: true, force: true });
  copyStatic();

  if (watch) {
    const ctx = await esbuild.context(shared);
    await ctx.watch();
    console.log("watching… reload the unpacked extension after rebuild");
  } else {
    await esbuild.build(shared);
    console.log("built → dist/");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
