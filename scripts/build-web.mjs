/**
 * Build the self-hosted demo into docs/ (GitHub Pages serves /docs from main,
 * so the built bundle is committed):
 * 1. esbuild src/web/app.ts -> docs/app.js (IIFE, minified; stats.ts and the
 *    lazy probe adapter are bundled from source).
 * 2. Copy index.html, style.css, the single-threaded ONNX wasm runtime and
 *    the measured data artifacts.
 * 3. Fail if any runtime path index.html references is missing.
 */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');

rmSync(DOCS, { recursive: true, force: true });
mkdirSync(DOCS, { recursive: true });

await build({
  entryPoints: [join(ROOT, 'src/web/app.ts')],
  outfile: join(DOCS, 'app.js'),
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2022',
  logLevel: 'warning',
});

copyFileSync(join(ROOT, 'src/web/index.html'), join(DOCS, 'index.html'));
copyFileSync(join(ROOT, 'src/web/style.css'), join(DOCS, 'style.css'));

// ONNX runtime wasm files (single-threaded; Pages cannot send COOP/COEP).
mkdirSync(join(DOCS, 'ort'), { recursive: true });
for (const f of readdirSync(join(ROOT, 'ort'))) {
  copyFileSync(join(ROOT, 'ort', f), join(DOCS, 'ort', f));
}

// Measured artifacts: golden set + precomputed statistics snapshot.
mkdirSync(join(DOCS, 'data'), { recursive: true });
for (const f of ['golden.json', 'snapshot.json']) {
  copyFileSync(join(ROOT, 'data', f), join(DOCS, 'data', f));
}

// Sanity: every runtime path the page needs must exist.
for (const f of [
  'app.js',
  'index.html',
  'style.css',
  'ort/ort-wasm-simd-threaded.wasm',
  'ort/ort-wasm-simd-threaded.mjs',
  'data/golden.json',
  'data/snapshot.json',
]) {
  if (!existsSync(join(DOCS, f))) throw new Error(`docs build missing ${f}`);
}
console.log('docs build complete');
