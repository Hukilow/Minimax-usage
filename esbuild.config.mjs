// esbuild config for the extension (Node target).
// Bundles the extension entrypoint into dist/extension.js (CJS for VS Code).

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const config = {
  entryPoints: [resolve(__dirname, 'src/extension.ts')],
  bundle: true,
  outfile: resolve(__dirname, 'dist/extension.js'),
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  minify: false,
  external: ['vscode'],
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
};

if (watch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log('[esbuild] watching...');
} else {
  await esbuild.build(config);
}
