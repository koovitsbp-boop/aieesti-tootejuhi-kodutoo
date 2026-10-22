// Check-in: vabast tekstist kirje (kasutus, säästetud tunnid, takistus), kohene vastus ja täpne video.
// Kolm teed, parimast lihtsamani:
//  1) MCP kaudu täidab Claude (kliendi pool) väljad ise vestluse põhjal, server ainult kontrollib ja salvestab.
//  2) Kui ANTHROPIC_API_KEY on seatud, loeb serveri poolel teksti Claude (Messages API).
//  3) Muidu reeglipõhine lugeja (töötab ilma võtmeta, demo jaoks piisav).
import { TOPICS, TOPIC_LESSON, getUser, getOrg, lessonMap, searchMaterial, describeMaterial, recordGap, releaseGap, matchOpenGap, dayInfo, moduleOf } from './logic.js';

const ANSWERS = {
  Excel: "Lase Claude'il kõigepealt kolm pakkumust ühte ühtsesse tabelisse tõsta ja alles siis võrrelda. Kui valemid lähevad sassi, palu tal näidata iga valemit eraldi ja kontrolli üht rida käsitsi.",
  Aeg: 'Pane kalendrisse reedeks 20 minutit ja tee üks ülesanne oma tööriistaga. Väike regulaarne samm on parem kui suur kord kuus.',
  Andmed: 'Kliendi nimed ja hinnad võid jagada, isikukoodid ja pangaandmed mitte. Vaata andmete klassifikatsiooni peatükki, seal on täpne nimekiri.',
  Skill: 'Lisa Skillile kaks head näidet varasematest töödest. Siis on tulemus palju ühtlasem.'
};
const REF = { Excel: ['l3', 0], Aeg: ['e3', null], Andmed: ['l3', 2], Skill: ['e5', null] };

/** Reeglipõhine lugeja. Sama mis veebilehe näidisvastus, et demo käituks ühtemoodi. */
export function ruleParse(text) {
  const t = String(text).toLowerCase();
  const none = /ei jõudnud|ei kasutanud|ei saanud kasutada|polnud aega/.test(t);
  let h = 0;
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(min|tund|h\b)/g)) { const v = parseFloat(m[1].replace(',', '.')); h += m[2] === 'min' ? v / 60 : v; }
  const times = t.match(/(kaks|kolm|neli|viis|kuus|\d+)\s+(pakkumust|korda|kirja|protokolli|raportit|dokumenti)/);
  const n = { kaks: 2, kolm: 3, neli: 4, viis: 5, kuus: 6 }[times?.[1]] || parseInt(times?.[1]) || 1;
  if (/iga kord|igaühe|igaüks|tükk/.test(t)) h *= n;
  if (!h && /poolteist tundi/.test(t)) h = 1.5;
  if (!h && /pool tundi/.test(t)) h = 0.5;
  if (!h && /\btund|\btunni/.test(t)) h = 1;
  if (!h && !none) h = 1;
  if (none) h = 0;
  const hours = Math.round(h * 2) / 2;
  if (/outlook/.test(t) && /kaust|reegl|sorteer/.test(t) && /ei saa|ei oska|aru|kuidas|kinni|segane/.test(t)) return {
    used: !none, use_case: 'E-kirjade kokkuvõtted', hours_saved: hours, blocker: 'Outlooki reeglid ja kaustad jäid segaseks', blocker_topic: 'Muu',
    answer: 'Claude ise Outlooki reegleid ei loo, aga oskab need sulle välja kirjutada. Kirjelda talle, millised kirjad kuhu peavad minema, ja palu samm-sammult juhend Outlooki reeglite seadistamiseks.',
    gap: 'Outlooki reeglid ja kaustade korrastamine', search: null };
  const topic = /excel|tabel|valem/.test(t) ? 'Excel' : /andme|konfidents|tohib|isikukood/.test(t) ? 'Andmed' : /skill|ebaühtlane|erinev tulemus/.test(t) ? 'Skill' : none ? 'Aeg' : null;
  const useCase = none ? null : /pakkum/.test(t) ? 'Pakkumuse koostamine' : /protokoll|koosolek/.test(t) ? 'Koosoleku protokoll' : /leping/.test(t) ? 'Lepingu ülevaatus' : /kiri|kirja|e-kir/.test(t) ? 'E-kirjad' : /raport|aruan/.test(t) ? 'Raport' : /päevik/.test(t) ? 'Objektipäevik' : 'AI kasutus tööülesandes';
  const blocker = none ? 'Ei leidnud aega' : topic === 'Excel' ? 'Exceli tabelid ja valemid jäid kinni' : topic === 'Andmed' ? "Polnud kindel, mida tohib Claude'iga jagada" : topic === 'Skill' ? 'Skill andis ebaühtlase tulemuse' : (/kinni|ei saa|ei oska|ei tea/.test(t) ? text.split(/[.!?]/).find(s => /kinni|ei saa|ei oska|ei tea/.test(s.toLowerCase()))?.trim() : null);
  return { used: !none, use_case: useCase, hours_saved: hours, blocker: blocker || null, blocker_topic: topic || (blocker ? 'Muu' : null),
    answer: ANSWERS[topic] || (blocker ? 'Kirjelda Claude\'ile täpselt, mis juhtus ja mis oli oodatud tulemus, ning palu tal küsida sinult kaks täpsustavat küsimust enne vastamist.' : 'Hea töö. Proovi järgmisel nädalal oma tööriista ka ühe uue ülesandega.'),
    gap: null, search: topic ? null : blocker };
}

/** Claude Messages API, kui võti on olemas. Vigade korral tagastab null ja kasutatakse reeglipõhist lugejat. */
export async function claudeParse(text, { user, materials }) {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) return null;
  const prompt = `Sa oled AI Eesti Academy abiline. Töötaja (${user?.name}, ${user?.role_title}) kirjutas oma iganädalase check-ini pärast AI koolitust.
Check-in:
"""${text}"""
Tee sellest kirje ja vasta AINULT ühe JSON objektiga, eesti keeles:
{"used": true/false, "use_case": "max 6 sõna" või null, "hours_saved": number tundides, "blocker": "lühike lause" või null,
 "blocker_topic": "Excel"|"Andmed"|"Skill"|"Aeg"|"Muu"|null, "answer": "2-3 lauset sina-vormis, praktiline järgmine samm",
 "lesson_id": sobiva video id või null, "chapter": peatüki number või null, "gap": "puuduva materjali teema max 8 sõna" või null}
Materjalid:
${materials}`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.ACADEMY_MODEL || 'claude-haiku-5-5', max_tokens: 600, messages: [{ role: 'user', content: prompt }] })
    });
    if (!r.ok) return null;
    const d = await r.json(); const txt = d.content?.map(c => c.text || '').join('') || '';
    const m = txt.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null;
  } catch { return null; }
}

function materialList(L) {
  return Object.values(L).map(l => `${l.id}: ${l.title}${(l.chapters || []).length ? '\n' + l.chapters.map((c, i) => `   [${i}] ${c.t} ${c.title}`).join('\n') : ''}`).join('\n');
}

/**
 * Salvestab check-ini. `fields` võib tulla MCP kliendilt (Claude täitis need vestluses); puuduvad väljad loeb server tekstist.
 * Tagastab sama kuju, mida veebilehe check-ini paneel näitab.
 */
export async function submitCheckin(db, { userId, text, source = 'web', fields = {} }) {
  const user = getUser(db, userId); if (!user) throw new Error('Tundmatu kasutaja');
  if (user.access === 'aieesti') throw new Error('Check-ini teevad ettevõtte töötajad, mitte AI Eesti meeskond.');
  const clean = typeof text === 'string' ? text.trim() : '';
  fields = Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, ['used', 'hours_saved'].includes(k) || v == null ? v : String(v).slice(0, 200)]));
  if (fields.hours_saved != null) fields.hours_saved = Number(fields.hours_saved);
  if (fields.used != null) fields.used = fields.used === true || fields.used === 'true';
  if (clean.length < 8) throw new Error('Kirjuta paar lauset: mida tegid ja kui palju aega see säästis.');
  const L = lessonMap(db); const org = getOrg(db);
  let p = await claudeParse(clean, { user, materials: materialList(L) });
  const engine = p ? 'claude-api' : 'reeglid';
  p = { ...ruleParse(clean), ...(p || {}) };
  // MCP kliendi väljad on kõige täpsemad: Claude on vestluses küsinud üle.
  for (const k of ['used', 'use_case', 'hours_saved', 'blocker', 'blocker_topic', 'answer']) if (fields[k] !== undefined && fields[k] !== null && fields[k] !== '') p[k] = fields[k];
  if (fields.blocker && !fields.blocker_topic && p.blocker_topic == null) p.blocker_topic = 'Muu';
  p.hours_saved = Math.max(0, Math.min(40, Number(p.hours_saved) || 0));
  if (p.used === false && fields.hours_saved == null) p.hours_saved = 0;
  if (p.blocker_topic && !TOPICS[p.blocker_topic]) p.blocker_topic = 'Muu';
  if (!p.blocker) p.blocker_topic = null;
  // Kui takistus tuli MCP kliendilt, aga reeglipõhine lugeja seda tekstist ei leidnud, ära vasta "hea töö".
  if (p.blocker && !fields.answer && (!p.answer || p.answer.startsWith('Hea töö'))) p.answer = ANSWERS[p.blocker_topic] ||
    "Kirjelda Claude'ile täpselt, mis juhtus ja mis oli oodatud tulemus, ning palu tal enne vastamist küsida sinult kaks täpsustavat küsimust. Kui see ei aita, tõstab Academy teema AI Eestile.";

  // Materjal: API vastus, siis teemakaart, siis märksõnaotsing takistuse tekstist. Kui midagi ei sobi, läheb teema lünkadesse.
  // Teadaolev sisulünk (AI Eesti juba teab, et selle kohta videot pole): ära paku lähedast, aga valet videot.
  if (p.blocker && !p.gap && !fields.gap) { const known = matchOpenGap(db, `${p.blocker} ${clean}`); if (known) p.gap = known.topic; }
  let lessonId = L[p.lesson_id] && !p.gap ? p.lesson_id : null;
  let chapter = lessonId && Number.isInteger(+p.chapter) && L[lessonId].chapters?.[+p.chapter] ? +p.chapter : null;
  if (!lessonId && !p.gap && p.blocker_topic && REF[p.blocker_topic] && !fields.blocker) [lessonId, chapter] = REF[p.blocker_topic];
  if (!lessonId && p.blocker && !p.gap) {
    const hit = searchMaterial(db, `${p.blocker} ${fields.blocker_topic || ''}`, 1)[0];
    if (hit && hit.score >= 3) { lessonId = hit.lesson_id; chapter = hit.chapter; }
    else if (p.blocker_topic && REF[p.blocker_topic]) [lessonId, chapter] = REF[p.blocker_topic];
    else p.gap = fields.gap || p.blocker;
  }
  if (!p.blocker && !lessonId) [lessonId, chapter] = ['l2', 2];
  if (p.used === false) p.use_case = null;
  if (fields.gap) { p.gap = fields.gap; lessonId = null; chapter = null; }
  const materialFound = !!lessonId && !p.gap;

  // Üks kasutaja-poolne check-in nädalas: uus asendab sama nädala eelmise (veebis nupp "Muuda").
  const { week, dayOf } = dayInfo(org);
  const mine = db.prepare("SELECT id, created_at, gap_id FROM checkins WHERE user_id = ? AND source != 'seed'").all(userId);
  mine.filter(c => Math.floor((dayOf(c.created_at) - 1) / 7) + 1 === week).forEach(c => { db.prepare('DELETE FROM checkins WHERE id = ?').run(c.id); releaseGap(db, c.gap_id, userId); });

  let gap = null;
  if (!materialFound && p.gap) gap = recordGap(db, { topic: p.gap, quote: clean.slice(0, 140), userId, today: org.today });

  const id = 'ci' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO checkins (id,user_id,created_at,used,use_case,hours_saved,blocker_topic,blocker,raw_text,answer,lesson_id,chapter,gap_id,source,submitted_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, userId, org.today, p.used ? 1 : 0, p.use_case || null, p.hours_saved, p.blocker_topic || null, p.blocker || null,
    clean, p.answer || null, materialFound ? lessonId : null, materialFound ? chapter : null, gap?.id || null, source, now);

  const material = materialFound ? describeMaterial(L[lessonId], chapter) : null;
  return {
    id, user: { id: user.id, name: user.name }, source, engine,
    used: !!p.used, use_case: p.use_case || null, hours_saved: p.hours_saved,
    blocker: p.blocker || null, blocker_topic: p.blocker_topic || null, answer: p.answer || null,
    material_found: materialFound, lesson_id: material?.lesson_id || null, chapter: material?.chapter ?? null, material,
    gap: gap ? gap.topic : null, gap_merged: gap?.merged || false,
    reached: ['juht', 'omanik', ...(gap ? ['AI Eesti'] : [])]
  };
}
export { moduleOf };
