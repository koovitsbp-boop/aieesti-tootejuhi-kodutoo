// Ehitab veebilehe mallist public/index.template.html. Server paneb SEED_JSON asemele andmebaasi seisu.
// Käivita: npm run build:web
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), P = f => readFileSync(join(here, 'parts', f), 'utf8');
const js = ['part_head.js', 'part_derived.js', 'part_proj.js', 'views.js', 'part_ai.js'].map(P).join('');
const body = P('shell.html').replace('LOGO_DARK', P('logo-dark.b64').trim())
  + `\n<script id="intro-b64" type="text/plain">${P('intro.b64')}</script>`
  + `\n<script id="intro-webm-b64" type="text/plain">${P('intro-webm.b64')}</script>`
  + `\n<script id="seed" type="application/json">SEED_JSON</script>\n<script>\n${js}</script>\n`;
const i = body.indexOf('<div class="shell">');
const html = `<!doctype html>\n<html lang="et">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${body.slice(0, i)}</head>\n<body>\n${body.slice(i)}\n</body>\n</html>\n`;
writeFileSync(join(here, '..', 'public', 'index.template.html'), html);
console.log('public/index.template.html', (html.length / 1e6).toFixed(1), 'MB');
