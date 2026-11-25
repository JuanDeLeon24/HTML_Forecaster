'use strict';
/**
 * Genera dist/HTML_Forecaster.html: un único archivo autocontenido (sin servidor, sin instalar nada)
 * con el motor completo, SQLite en WebAssembly, Chart.js y estilos compilados.
 *   npm run build:standalone
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const r = (...p) => path.join(ROOT, ...p);
const read = (p) => fs.readFileSync(p, 'utf8');

const ALIASES = {
  [r('backend/config.js')]: r('standalone/config.js'),
  [r('backend/lib/logger.js')]: r('standalone/logger.js'),
  [r('backend/database/db.js')]: r('standalone/dbStub.js'),
};

const aliasPlugin = {
  name: 'alias',
  setup(build) {
    build.onResolve({ filter: /^(fs|path|crypto)$/ }, () => ({ path: 'empty', namespace: 'empty' }));
    build.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: 'module.exports = {};' }));
    build.onResolve({ filter: /^\.\.?\// }, (args) => {
      let p = path.resolve(args.resolveDir, args.path);
      if (!path.extname(p)) p += '.js';
      return ALIASES[p] ? { path: ALIASES[p] } : undefined;
    });
  },
};

async function main() {
  const bundle = await esbuild.build({
    entryPoints: [r('standalone/main.js')],
    bundle: true, write: false, minify: true, format: 'iife', platform: 'browser', target: ['es2020'],
    loader: { '.sql': 'text' }, plugins: [aliasPlugin], legalComments: 'none',
  });
  const engineJs = bundle.outputFiles[0].text;

  const twConfig = r('scripts/tailwind.config.js');
  const twOut = path.join(require('node:os').tmpdir(), `hf-tw-${process.pid}.css`);
  const twIn = path.join(require('node:os').tmpdir(), `hf-tw-in-${process.pid}.css`);
  fs.writeFileSync(twIn, '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');
  execFileSync(process.execPath, [require.resolve('tailwindcss/lib/cli.js'), '-c', twConfig, '-i', twIn, '-o', twOut, '--minify'], { cwd: ROOT, stdio: 'pipe' });
  const tailwindCss = read(twOut);
  fs.rmSync(twOut); fs.rmSync(twIn);

  const wasm = fs.readFileSync(r('node_modules/sql.js/dist/sql-wasm.wasm')).toString('base64');
  const chartJs = read(r('node_modules/chart.js/dist/chart.umd.js'));
  const pageJs = ['common.js', 'index.js', 'analysis.js', 'stats.js', 'history.js'].map((f) => read(r('frontend/assets', f))).join('\n;\n')
    + '\n;\n' + read(r('standalone/settings.js'));
  const pageJsMin = (await esbuild.transform(pageJs, { minify: true, target: 'es2020' })).code;
  const appCss = read(r('frontend/assets/app.css'));
  const collector = (await esbuild.transform(read(r('standalone/bookmarklet.src.js')), { minify: true, target: 'es2020' })).code.trim();
  if (!collector.includes('__CFG__')) throw new Error('El recolector minificado perdió el marcador __CFG__');
  const version = require(r('backend/modelConfig.js')).version;
  const esc = (s) => s.replace(/<\/script/gi, '<\\/script');

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>HTML_FORECASTER</title>
<!-- HTML_FORECASTER v${version} · archivo único generado ${new Date().toISOString().slice(0, 10)} · ábrelo con doble clic en Chrome/Edge/Firefox -->
<style>${tailwindCss}</style>
<style>${appCss}
#boot { padding: 48px 16px; text-align: center; color: var(--muted); font-size: 14px; }</style>
</head>
<body>
<div id="boot">Iniciando el motor de HTML_FORECASTER…</div>
<main class="max-w-7xl mx-auto px-4 py-5 space-y-5" id="root"></main>
<script>${esc(chartJs)}</script>
<script>window.__SQL_WASM__ = "${wasm}";</script>
<script>window.__HF_COLLECTOR__ = ${esc(JSON.stringify(collector))};</script>
<script>${esc(pageJsMin)}</script>
<script>${esc(engineJs)}</script>
</body>
</html>
`;
  fs.mkdirSync(r('dist'), { recursive: true });
  const out = r('dist/HTML_Forecaster.html');
  fs.writeFileSync(out, html);
  console.log(`Generado ${path.relative(ROOT, out)} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
