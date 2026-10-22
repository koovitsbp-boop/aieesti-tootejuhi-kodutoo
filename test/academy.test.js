import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { ruleParse } from '../src/checkin.js';
import { roi, searchMaterial, contentGaps, nextSteps } from '../src/logic.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function start() {
  const db = openDb(':memory:');
  const srv = createApp({ db }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  return { db, srv, base: `http://127.0.0.1:${srv.address().port}` };
}
async function mcp(base, token) {
  const c = new Client({ name: 'test', version: '1' });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/${token}`)));
  return c;
}

test('reeglipõhine lugeja arvutab tunnid', () => {
  assert.equal(ruleParse('Tegin neli pakkumust, iga kord säästsin umbes 40 minutit.').hours_saved, 2.5);
  assert.equal(ruleParse('Kasutasin protokolliks, säästsin poolteist tundi.').hours_saved, 1.5);
  const none = ruleParse('Sel nädalal ei jõudnud AI-d kasutada.');
  assert.equal(none.used, false); assert.equal(none.hours_saved, 0); assert.equal(none.blocker_topic, 'Aeg');
});

test('tasuvus vastab veebilehe numbritele', () => {
  const r = roi(openDb(':memory:'));
  assert.equal(r.own_cost_eur, 6048);
  assert.equal(r.day, 25);
  assert.equal(r.payback_day, 38);
});

test('materjali otsing leiab peatüki koos slaididega', () => {
  const db = openDb(':memory:');
  const hit = searchMaterial(db, 'Outlook ja Teams')[0];
  assert.ok(hit); assert.equal(hit.lesson_id, 'l3'); assert.equal(hit.slides, '32–55');
  assert.equal(searchMaterial(db, 'kosmoselaevad marsil').length, 0);
});

test('nädala ülesanne viitab koolituse harjutusele', () => {
  const n = nextSteps(openDb(':memory:'), 'u1');
  const m = n.queue.find(q => q.why.startsWith('Nädala'));
  assert.match(m.why, /harjutus 2\.3/);
});

test('MCP: rollid näevad ainult oma tööriistu', async () => {
  const { srv, base } = await start();
  try {
    const names = async t => { const c = await mcp(base, t); const r = (await c.listTools()).tools.map(x => x.name); await c.close(); return r; };
    const mari = await names('demo-mari'), andres = await names('demo-andres'), toomas = await names('demo-toomas'), aie = await names('demo-aieesti');
    assert.ok(mari.includes('submit_checkin') && !mari.includes('get_roi') && !mari.includes('get_team_overview'));
    assert.ok(andres.includes('get_team_overview') && andres.includes('feature_tool') && !andres.includes('get_roi'));
    assert.ok(toomas.includes('get_roi'));
    assert.ok(aie.includes('get_content_gaps') && !aie.includes('submit_checkin'));
  } finally { srv.close(); }
});

test('MCP: vale token annab 401', async () => {
  const { srv, base } = await start();
  try {
    const r = await fetch(`${base}/mcp/vale`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{}' });
    assert.equal(r.status, 401);
  } finally { srv.close(); }
});

test('MCP check-in jõuab juhi vaatesse ja lünk AI Eestile', async () => {
  const { db, srv, base } = await start();
  try {
    const before = (await (await fetch(`${base}/api/state`)).json());
    const c = await mcp(base, 'demo-kristel');
    const r = await c.callTool({ name: 'submit_checkin', arguments: {
      text: 'Kasutasin hankedokumentide kokkuvõteteks, säästsin 3 tundi. Tahtsin, et Claude täidaks hanke vormi otse riigihangete registris, aga ei saanud aru kuidas.',
      hours_saved: 3, use_case: 'Hankedokumentide kokkuvõtted', blocker: 'Hanke vormi täitmine riigihangete registris', blocker_topic: 'Muu' } });
    await c.close();
    assert.equal(r.structuredContent.material_found, false);
    assert.ok(r.structuredContent.gap);
    const after = await (await fetch(`${base}/api/state`)).json();
    assert.equal(after.checkins.length, before.checkins.length + 1);
    assert.notEqual(after.version, before.version);
    const mine = after.checkins.find(x => x.id === r.structuredContent.id);
    assert.equal(mine.source, 'mcp'); assert.equal(mine.fresh, true);
    assert.ok(contentGaps(db).open.some(g => g.topic === r.structuredContent.gap));
    const team = await (await fetch(`${base}/api/team`, { headers: { authorization: 'Bearer demo-andres' } })).json();
    assert.equal(team.people.find(p => p.id === 'u3').hours_saved > 0, true);
  } finally { srv.close(); }
});

test('API: token ilma õiguseta saab 403', async () => {
  const { srv, base } = await start();
  try {
    const r = await fetch(`${base}/api/roi`, { headers: { authorization: 'Bearer demo-mari' } });
    assert.equal(r.status, 403);
  } finally { srv.close(); }
});

test('API: sama nädala uus check-in asendab eelmise', async () => {
  const { srv, base } = await start();
  try {
    const post = text => fetch(`${base}/api/checkins`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user_id: 'u1', text }) }).then(r => r.json());
    const n0 = (await (await fetch(`${base}/api/state`)).json()).checkins.length;
    await post('Tegin kaks pakkumust, säästsin tund aega.');
    await post('Tegin kolm pakkumust, säästsin kaks tundi.');
    const s = await (await fetch(`${base}/api/state`)).json();
    assert.equal(s.checkins.length, n0 + 1);
  } finally { srv.close(); }
});

test('lünk: sama inimene loeb ühe korra, asendatud check-in vabastab lünga', async () => {
  const { db, srv, base } = await start();
  try {
    const post = (u, text) => fetch(`${base}/api/checkins`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user_id: u, text }) }).then(r => r.json());
    const a = await post('u3', 'Säästsin tund aega. Jira piletite sünkroniseerimine Claudega jäi kinni, ei saa aru kuidas.');
    assert.ok(a.gap);
    const g = () => db.prepare('SELECT * FROM gaps WHERE topic = ?').get(a.gap);
    assert.equal(g().people, 1);
    await post('u3', 'Säästsin tund aega. Jira piletite sünkroniseerimine Claudega jäi kinni, ei saa aru kuidas.');
    assert.equal(g().people, 1);
    await post('u4', 'Säästsin kaks tundi. Jira piletite sünkroniseerimine jäi kinni, ei saa aru kuidas.');
    assert.equal(g().people, 2);
    await post('u3', 'Tegin kolm pakkumust, säästsin kaks tundi.');
    assert.equal(g().people, 1);
  } finally { srv.close(); }
});

test('lünk: erinevad Outlooki teemad ei sulandu, teadaolev lünk ei paku valet videot', async () => {
  const { srv, base } = await start();
  try {
    const c = await mcp(base, 'demo-mari');
    const r1 = await c.callTool({ name: 'submit_checkin', arguments: { text: 'Säästsin tund aega. Outlooki kalendri jagamine kolleegidega jäi kinni.', hours_saved: 1, blocker: 'Outlooki kalendri jagamine kolleegidega', blocker_topic: 'Muu' } });
    assert.notEqual(r1.structuredContent.gap, 'Outlooki reeglid ja kaustade korrastamine');
    const c2 = await mcp(base, 'demo-kristel');
    const r2 = await c2.callTool({ name: 'submit_checkin', arguments: { text: 'Säästsin tund aega. Outlooki kaustad ja reeglid jäid segaseks.', hours_saved: 1, blocker: 'Outlooki kaustad ja reeglid', blocker_topic: 'Muu' } });
    assert.equal(r2.structuredContent.material_found, false);
    assert.equal(r2.structuredContent.gap, 'Outlooki reeglid ja kaustade korrastamine');
    await c.close(); await c2.close();
  } finally { srv.close(); }
});

test('API: AI Eesti ei saa check-ini teha, katkine JSON annab JSON-vea', async () => {
  const { srv, base } = await start();
  try {
    const r = await fetch(`${base}/api/checkins`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer demo-aieesti' }, body: JSON.stringify({ text: 'Säästsin kaks tundi pakkumustega.' }) });
    assert.equal(r.status, 400);
    const b = await fetch(`${base}/api/checkins`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{katki' });
    assert.equal(b.status, 400); assert.equal((await b.json()).error, 'Vigane JSON');
  } finally { srv.close(); }
});
