// esbuild config for the webview bundle (browser target).
// Bundles src/webview/main.ts into dist/web/main.js (IIFE) and copies the
// webview stylesheet alongside it.

import * as esbuild from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "dist/web");

await mkdir(outDir, { recursive: true });

/** @type {import('esbuild').BuildOptions} */
const config = {
  entryPoints: [resolve(__dirname, "src/webview/main.ts")],
  bundle: true,
  outfile: resolve(outDir, "main.js"),
  platform: "browser",
  target: "es2022",
  format: "iife",
  sourcemap: true,
  minify: true,
  logLevel: "info",
};

await esbuild.build(config);

// Copy the stylesheet (referenced from the extension's webview HTML).
await copyFile(
  resolve(__dirname, "src/webview/styles.css"),
  resolve(outDir, "styles.css"),
);
console.log("[esbuild] web bundle ready");
