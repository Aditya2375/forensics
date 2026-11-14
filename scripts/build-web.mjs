/**
 * Build the self-hosted demo into docs/ (GitHub Pages serves /docs from main,
 * so the built bundle is committed): esbuild src/web/app.ts -> docs/app.js
 * (IIFE, minified; the core library is bundled from source), copy index.html,
 * style.css and the self-hosted fonts. Fails if a runtime path is missing.
 */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');

// keep committed fonts, rebuild everything else
for (const f of readdirSync(DOCS)) {
  if (f !== 'fonts') rmSync(join(DOCS, f), { recursive: true, force: true });
}

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

for (const f of ['app.js', 'index.html', 'style.css',
  'fonts/clash-display-500.woff2', 'fonts/clash-display-600.woff2',
  'fonts/satoshi-400.woff2', 'fonts/satoshi-500.woff2', 'fonts/satoshi-700.woff2',
  'fonts/jetbrains-mono.woff2']) {
  if (!existsSync(join(DOCS, f))) throw new Error(`docs build missing ${f}`);
}
console.log('docs build complete');
