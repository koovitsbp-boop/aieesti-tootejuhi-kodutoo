// AI Eesti Academy server: veebileht, REST API ja MCP (Streamable HTTP) ühes protsessis.
import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { openDb, seed, ROOT } from './db.js';
import { createMcpServer } from './mcp.js';
import { submitCheckin } from './checkin.js';
import { buildState, stateVersion, userByToken, getUser, nextSteps, teamOverview, roi, contentGaps, searchMaterial, requestWorkshop, setFeatured, userStats } from './logic.js';

export function createApp({ db = openDb(), host = process.env.HOST || '127.0.0.1', demo = process.env.ACADEMY_DEMO !== 'off', allowedHosts } = {}) {
  const app = allowedHosts ? createMcpExpressApp({ host, allowedHosts }) : createMcpExpressApp({ host });
  app.use(express.json({ limit: '200kb' }));
  app.set('trust proxy', true);

  // Kes küsib: Bearer token. Demo veebis (ilma tokenita) on kasutaja user_id järgi, vaikimisi Mari.
  // Päris tootes asendab selle OAuth ja demo-režiim lülitatakse välja (ACADEMY_DEMO=off).
  const need = (roles) => (req, res, next) => {
    const auth = req.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : req.query.token;
    let u = null;
    if (token) {
      u = userByToken(db, token);
      if (!u) return res.status(401).json({ error: 'Vale token' });
      if (roles && !roles.includes(u.access)) return res.status(403).json({ error: 'Sellel rollil pole ligipääsu' });
    } else if (demo) {
      u = getUser(db, String(req.body?.user_id || req.query.user_id || 'u1'));
    }
    if (!u) return res.status(401).json({ error: 'Puudub ligipääs' });
    req.user = u; next();
  };

  /* ---------- REST API ---------- */
  app.get('/health', (req, res) => res.json({ ok: true }));
  app.get('/api/state', (req, res) => res.json(buildState(db)));
  app.get('/api/version', (req, res) => res.json({ version: stateVersion(db) }));
  app.post('/api/checkins', need(), async (req, res) => {
    try { res.status(201).json(await submitCheckin(db, { userId: req.user.id, text: req.body?.text, source: req.body?.source === 'mcp' ? 'mcp' : 'web', fields: req.body?.fields || {} })); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.get('/api/me', need(), (req, res) => res.json({ user: req.user, ...userStats(db, req.user.id) }));
  app.get('/api/next', need(), (req, res) => res.json(nextSteps(db, req.user.id)));
  app.get('/api/material', (req, res) => res.json({ query: req.query.q || '', results: searchMaterial(db, String(req.query.q || ''), 5) }));
  app.get('/api/team', need(['manager', 'owner', 'aieesti']), (req, res) => res.json(teamOverview(db)));
  app.get('/api/roi', need(['owner', 'aieesti']), (req, res) => res.json(roi(db)));
  app.get('/api/gaps', need(['aieesti']), (req, res) => res.json(contentGaps(db)));
  app.post('/api/workshops', need(['manager', 'owner']), (req, res) => res.status(201).json(requestWorkshop(db, { userId: req.user.id, topic: String(req.body?.topic || 'Töötuba'), note: req.body?.note })));
  app.post('/api/tools/:id/feature', need(['manager']), (req, res) => setFeatured(db, req.params.id, req.body?.featured !== false) ? res.json({ ok: true }) : res.status(404).json({ error: 'Sellist tööriista pole' }));
  if (demo) app.post('/api/reset', (req, res) => { seed(db); res.json({ ok: true, version: stateVersion(db) }); });

  /* ---------- MCP ---------- */
  // /mcp koos päisega "Authorization: Bearer <token>" või /mcp/<token> (Claude'i custom connector ilma OAuthita).
  const mcp = async (req, res) => {
    const user = (() => { const auth = req.get('authorization') || ''; const t = auth.startsWith('Bearer ') ? auth.slice(7) : req.params.token; return t ? userByToken(db, t) : null; })();
    if (!user) return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Vale või puuduv token. Demo tokenid: demo-mari, demo-andres, demo-toomas, demo-aieesti.' }, id: null });
    const base = process.env.ACADEMY_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const server = createMcpServer(db, user, { publicUrl: base });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch (e) { if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Serveri viga' }, id: null }); }
  };
  const notAllowed = (req, res) => res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Kasuta POST päringut (stateless MCP).' }, id: null });
  app.post('/mcp', mcp); app.post('/mcp/:token', mcp);
  app.get('/mcp', notAllowed); app.get('/mcp/:token', notAllowed);
  app.delete('/mcp', notAllowed); app.delete('/mcp/:token', notAllowed);

  /* ---------- veebileht ---------- */
  const tplPath = join(ROOT, 'public', 'index.template.html');
  app.get(['/', '/index.html'], (req, res) => {
    if (!existsSync(tplPath)) return res.status(500).send('public/index.template.html puudub');
    const tpl = readFileSync(tplPath, 'utf8');
    const json = JSON.stringify(buildState(db)).replace(/</g, '\\u003c');
    const html = tpl.replace('<script id="seed" type="application/json">SEED_JSON</script>',
      `<script>window.ACADEMY_API="/api";</script>\n<script id="seed" type="application/json">${json}</script>`);
    res.type('html').set('Cache-Control', 'no-store').send(html);
  });
  // MCP demo: vasakul päris tööriistakõned, paremal Academy, mis uueneb kohe. Ainult demo-režiimis.
  if (demo) app.get('/demo', (req, res) => res.sendFile(join(ROOT, 'public', 'demo.html')));
  app.get('/tutvustus.mp4', (req, res) => { const p = join(ROOT, 'public', 'tutvustus.mp4'); existsSync(p) ? res.sendFile(p) : res.sendStatus(404); });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = +(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
  const allowedHosts = process.env.ALLOWED_HOSTS ? process.env.ALLOWED_HOSTS.split(',') : undefined;
  createApp({ host, allowedHosts }).listen(port, host, () => {
    const base = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`;
    console.log(`AI Eesti Academy töötab: ${base}`);
    console.log(`MCP (Mari):  ${base}/mcp/demo-mari`);
    console.log(`MCP (juht):  ${base}/mcp/demo-andres   omanik: /mcp/demo-toomas   AI Eesti: /mcp/demo-aieesti`);
  });
}
