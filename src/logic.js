// Äriloogika: oleku kokkupanek, ajavõit ja tasuvus, järgmine samm, materjali otsing, sisulüngad.
// Sama loogika on veebilehel (web/parts/*.js). Siin on see serveri poolel, et MCP, API ja veeb näeksid samu numbreid.

export const TOPICS = {
  Excel: 'Excel ja suured tabelid',
  Andmed: "Mida tohib Claude'iga jagada",
  Skill: 'Skill annab ebaühtlase tulemuse',
  Aeg: 'Pole aega uut proovida',
  Muu: 'Muu'
};
export const TOPIC_LESSON = { Excel: 'e2', Andmed: 'e4', Skill: 'e5', Aeg: 'e3', Muu: 'l1' };
const MOD = { l1: 1, l2: 2, l3: 3, l4: 4, l5: 5, l6: 6 };
const PARENT = { e1: 'l2', e2: 'l3', e3: 'l3', e4: 'l3', e5: 'l2', e6: 'l1' };

const j = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const round1 = n => Math.round(n * 10) / 10;

/* ---------- olek ---------- */
export function getOrg(db) {
  const o = db.prepare('SELECT * FROM organizations LIMIT 1').get();
  const { sessions_json, ...rest } = o;
  return { ...rest, sessions: j(sessions_json, []) };
}
export function getUser(db, id) { return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null; }
export function userByToken(db, token) {
  const r = db.prepare('SELECT user_id FROM tokens WHERE token = ?').get(String(token || ''));
  return r ? getUser(db, r.user_id) : null;
}
export function lessons(db) { return db.prepare('SELECT data FROM lessons ORDER BY position').all().map(r => JSON.parse(r.data)); }
export function lessonMap(db) { return Object.fromEntries(lessons(db).map(l => [l.id, l])); }
export function moduleOf(l) { return MOD[l.kind === 'recording' ? l.id : PARENT[l.id]] || null; }

function checkinRows(db) {
  return db.prepare('SELECT c.*, g.topic AS gap_topic FROM checkins c LEFT JOIN gaps g ON g.id = c.gap_id ORDER BY c.created_at, c.submitted_at, c.id').all();
}
function publicCheckin(c, freshCutoff) {
  const out = { id: c.id, user_id: c.user_id, created_at: c.created_at, used: !!c.used, use_case: c.use_case,
    hours_saved: c.hours_saved, blocker_topic: c.blocker_topic, blocker: c.blocker };
  if (c.source !== 'seed') {
    out.source = c.source; out.submitted_at = c.submitted_at; out.fresh = !!(c.submitted_at && c.submitted_at >= freshCutoff);
    out.detail = { raw: c.raw_text, answer: c.answer, lesson_id: c.lesson_id, chapter: c.chapter, gap: c.gap_topic || null };
  }
  return out;
}
function gapRows(db) {
  return db.prepare("SELECT * FROM gaps ORDER BY CASE status WHEN 'done' THEN 1 ELSE 0 END, people DESC, first_seen").all();
}
function publicGap(g, freshCutoff) {
  const out = { id: g.id, topic: g.topic, people: g.people, companies: j(g.companies_json, []), quote: g.quote, first_seen: g.first_seen, status: g.status };
  if (g.lesson_id) out.lesson = g.lesson_id;
  if (g.updated_at && g.updated_at >= freshCutoff) out.live = true;
  return out;
}

/** Sama kuju nagu web/seed.json, et veebileht saaks selle otse kasutada. */
export function buildState(db, { freshMinutes = 30 } = {}) {
  const freshCutoff = new Date(Date.now() - freshMinutes * 60e3).toISOString();
  const org = getOrg(db);
  const users = db.prepare("SELECT id, org_id, name, role_title, access FROM users WHERE access != 'aieesti' ORDER BY CAST(SUBSTR(id,2) AS INTEGER)").all();
  const progress = {};
  db.prepare('SELECT * FROM progress').all().forEach(p => (progress[p.user_id] ||= []).push(p.lesson_id));
  return {
    organization: org,
    users,
    courses: db.prepare('SELECT data FROM courses').all().map(r => JSON.parse(r.data)),
    lessons: lessons(db),
    tools: db.prepare('SELECT * FROM tools').all().map(t => ({ ...t, shared: !!t.shared, featured: !!t.featured })),
    checkins: checkinRows(db).map(c => publicCheckin(c, freshCutoff)),
    missions: db.prepare('SELECT * FROM missions ORDER BY week').all().map(m => Object.fromEntries(Object.entries(m).filter(([, v]) => v != null))),
    progress,
    me: db.prepare("SELECT value FROM meta WHERE key='me'").get()?.value || 'u1',
    gaps: gapRows(db).map(g => publicGap(g, freshCutoff)),
    version: stateVersion(db)
  };
}
/** Muutub iga kord, kui check-in või lünk lisandub. Veeb kasutab seda, et teada, millal uuesti joonistada. */
export function stateVersion(db) {
  const a = db.prepare("SELECT COUNT(*) n, COALESCE(MAX(submitted_at),'') m FROM checkins").get();
  const b = db.prepare("SELECT COUNT(*) n, COALESCE(MAX(updated_at),'') m, COALESCE(SUM(people),0) p FROM gaps").get();
  const t = db.prepare("SELECT COALESCE(SUM(featured),0) f, COUNT(*) n FROM tools").get();
  return [a.n, a.m, b.n, b.m, b.p, t.f, t.n].join('|');
}

/* ---------- päevad ja ajavõit ---------- */
const dt = d => new Date(d + 'T12:00:00Z');
export function dayInfo(org) {
  const DAY = Math.round((dt(org.today) - dt(org.course_end_date)) / 864e5);
  const dayOf = d => Math.round((dt(d) - dt(org.course_end_date)) / 864e5);
  return { DAY, dayOf, week: Math.min(13, Math.floor(DAY / 7) + 1) };
}

export function totals(db) {
  const org = getOrg(db); const { DAY, dayOf } = dayInfo(org);
  const C = checkinRows(db);
  const hours = C.reduce((a, c) => a + (+c.hours_saved || 0), 0);
  const weeks = Array(13).fill(0);
  C.forEach(c => { const w = Math.max(0, Math.min(12, Math.floor((dayOf(c.created_at) - 1) / 7))); weeks[w] += +c.hours_saved || 0; });
  const doneWeeks = Math.floor(DAY / 7);
  const recent = weeks.slice(0, Math.max(1, doneWeeks)).filter(Boolean);
  const pace = recent.length ? recent.slice(-2).reduce((a, b) => a + b, 0) / Math.min(2, recent.length) : 0;
  const active = new Set(C.filter(c => c.used && DAY - dayOf(c.created_at) <= 10).map(c => c.user_id));
  return { hours, weeks, doneWeeks, pace, active, DAY };
}

export function roi(db) {
  const org = getOrg(db); const t = totals(db); const rate = org.hourly_cost_eur;
  const own = org.program_price_eur - org.subsidy_eur;
  let cum = 0; const curve = [];
  for (let w = 0; w < 13; w++) { const part = w === 12 ? (90 - 84) / 7 : 1; cum += (w < t.doneWeeks ? t.weeks[w] : t.pace) * part; curve.push({ week: w + 1, value_eur: Math.round(cum * rate), actual: w < t.doneWeeks }); }
  let payDay = null, c = 0;
  for (let d = 1; d <= 90 && payDay === null; d++) {
    const w = Math.floor((d - 1) / 7); c += ((w < t.doneWeeks ? t.weeks[w] : t.pace) / 7) * rate; if (c >= own) payDay = d;
  }
  const users = db.prepare("SELECT COUNT(*) n FROM users WHERE access != 'aieesti'").get().n;
  const value = t.hours * rate;
  return {
    program: org.program, participants: org.participants,
    price_eur: org.program_price_eur, subsidy_eur: org.subsidy_eur, own_cost_eur: own,
    hourly_cost_eur: rate, day: t.DAY, hours_saved: round1(t.hours), value_today_eur: Math.round(value),
    paid_back: value >= own, payback_day: payDay,
    projected_value_day90_eur: curve[curve.length - 1].value_eur,
    projected_multiple: round1(curve[curve.length - 1].value_eur / own),
    active_last_10_days: t.active.size, people: users,
    weekly_hours: t.weeks.map(round1), pace_hours_per_week: round1(t.pace), curve
  };
}

export function userStats(db, id) {
  const org = getOrg(db); const { DAY, dayOf } = dayInfo(org);
  const C = db.prepare('SELECT * FROM checkins WHERE user_id = ? ORDER BY created_at DESC, submitted_at DESC').all(id);
  const hours = C.reduce((a, c) => a + (+c.hours_saved || 0), 0);
  const last = C[0] || null;
  let status = 'idle';
  if (last && DAY - dayOf(last.created_at) <= 10) status = last.blocker_topic ? 'warn' : 'ok';
  return { checkins: C, hours: round1(hours), last, status };
}

export function teamOverview(db) {
  const org = getOrg(db); const t = totals(db);
  const users = db.prepare("SELECT * FROM users WHERE access != 'aieesti'").all();
  const label = { ok: 'Kasutab', warn: 'Jäi kinni', idle: 'Vaikne' };
  const people = users.map(u => { const s = userStats(db, u.id); return {
    id: u.id, name: u.name, role_title: u.role_title, status: s.status, status_label: label[s.status],
    hours_saved: s.hours, last_checkin: s.last ? s.last.created_at : null, last_use_case: s.last?.use_case || null, last_blocker: s.last?.blocker || null }; })
    .sort((a, b) => ({ warn: 0, idle: 1, ok: 2 }[a.status] - { warn: 0, idle: 1, ok: 2 }[b.status]) || b.hours_saved - a.hours_saved);
  const by = {};
  db.prepare('SELECT user_id, blocker_topic FROM checkins WHERE blocker_topic IS NOT NULL').all()
    .forEach(c => (by[c.blocker_topic] ||= new Set()).add(c.user_id));
  const blockers = Object.entries(by).map(([k, v]) => ({ topic: k, label: TOPICS[k] || k, people: v.size })).sort((a, b) => b.people - a.people);
  const tools = db.prepare('SELECT * FROM tools ORDER BY featured DESC, uses DESC').all().map(x => ({ ...x, shared: !!x.shared, featured: !!x.featured, owner_name: getUser(db, x.owner)?.name }));
  return {
    organization: org.name, program: org.program, day: t.DAY,
    active_last_10_days: t.active.size, people_total: users.length, hours_saved: round1(t.hours),
    quiet: people.filter(p => p.status === 'idle').length,
    weekly_hours: t.weeks.slice(0, t.doneWeeks + 1).map(round1),
    blockers, suggestion: blockers[0] ? `${blockers[0].people} inimest jäid kinni teemaga "${blockers[0].label.toLowerCase()}". AI Eesti saab teha kahetunnise töötoa teie enda failidega.` : null,
    people, tools
  };
}

/* ---------- materjali otsing ---------- */
const STOP = new Set('ja ning et kui aga see ses selle sellest mis kes kuidas kas oli olen oma ei ole on ka siis veel nagu väga mul minu meil teha tegin teen tahan tahtsin sain saan jäi jäid läks lähevad kinni ära sisse välja üle alla pärast enne kuid või iga kord umbes nädal nädalal sel claude claudeiga ai'.split(' '));
const SYN = {
  excel: ['tabel', 'valem', 'hinnavõrdlus', 'võrdl'], tabel: ['excel'], valem: ['excel'],
  outlook: ['kiri', 'kirja', 'e-kiri', 'mail', 'postkast'], kiri: ['outlook'], kirjad: ['outlook'], postkast: ['outlook'],
  protokoll: ['koosolek', 'teams'], koosolek: ['protokoll', 'teams'], teams: ['koosolek', 'protokoll'],
  skill: ['oskus'], prompt: ['küsimus', 'juhis'], leping: ['pdf', 'dokument'], pdf: ['leping', 'dokument'],
  konfidentsiaal: ['andme', 'klassifikatsioon', 'tohib'], isikuandme: ['andme', 'klassifikatsioon', 'tohib'], tohib: ['andme', 'klassifikatsioon']
};
const stem = w => w.length > 6 ? w.slice(0, 6) : w;
export function tokens(text, { synonyms = true } = {}) {
  const words = String(text || '').toLowerCase().normalize('NFC').split(/[^a-zäöüõšž0-9-]+/).filter(w => w.length > 2 && !STOP.has(w));
  const out = new Set();
  for (const w of words) { out.add(stem(w)); if (synonyms) for (const [k, v] of Object.entries(SYN)) if (w.startsWith(k)) v.forEach(s => out.add(stem(s))); }
  return out;
}
function index(db) {
  const docs = [];
  for (const l of lessons(db)) {
    const base = `${l.title} ${l.summary || ''} ${l.topic ? TOPICS[l.topic] : ''}`;
    if (l.kind === 'explainer') docs.push({ lesson: l, chapter: null, text: base, weightText: l.title });
    (l.chapters || []).forEach((c, i) => docs.push({ lesson: l, chapter: i, text: `${c.title} ${l.title}`, weightText: c.title }));
  }
  return docs;
}
/** Tagastab kuni n sobivat videot/peatükki koos skooriga. Lihtne märksõnaotsing; Claude (MCP klient) sõnastab päringu ise. */
export function searchMaterial(db, query, n = 3) {
  const q = tokens(query); if (!q.size) return [];
  const hits = index(db).map(d => {
    const strong = tokens(d.weightText), all = tokens(d.text); let score = 0;
    q.forEach(t => { if (strong.has(t)) score += 2; else if (all.has(t)) score += 1; });
    if (d.lesson.kind === 'explainer') score += 0.25; // lühike video on enamasti parem vastus kui 4-tunnine salvestus
    return { ...d, score };
  }).filter(h => h.score >= 2).sort((a, b) => b.score - a.score);
  const seen = new Set(), out = [];
  for (const h of hits) { const k = h.lesson.id + ':' + h.chapter; if (seen.has(k)) continue; seen.add(k); out.push(describeMaterial(h.lesson, h.chapter, h.score)); if (out.length >= n) break; }
  return out;
}
export function describeMaterial(l, chapter, score) {
  const ch = chapter != null ? l.chapters?.[chapter] : null;
  const m = moduleOf(l);
  return {
    lesson_id: l.id, chapter: ch ? chapter : null,
    title: ch ? ch.title : l.title,
    where: ch ? `Moodul ${m}, "${l.title}", alates ${ch.t}` : (l.kind === 'explainer' ? `Kiirjuhend, ${Math.round(l.duration_s / 60)} min${m ? `, moodul ${m}` : ''}` : `Moodul ${m}, "${l.title}"`),
    slides: ch?.slides ? `${ch.slides[0]}–${ch.slides[1]}` : null,
    link: `#tund/${l.id}/${ch ? chapter : 0}`,
    ...(score != null ? { score } : {})
  };
}

/* ---------- järgmine samm ---------- */
export function nextSteps(db, userId) {
  const org = getOrg(db); const { week } = dayInfo(org); const L = lessonMap(db);
  const st = userStats(db, userId);
  const seen = new Set(db.prepare('SELECT lesson_id FROM progress WHERE user_id = ?').all(userId).map(r => r.lesson_id));
  const missions = db.prepare('SELECT * FROM missions ORDER BY week').all();
  const mission = missions.find(m => m.week === week) || missions[missions.length - 1];
  const q = [];
  const last = st.checkins[0];
  if (last && last.lesson_id && L[last.lesson_id]) q.push({ ...describeMaterial(L[last.lesson_id], last.chapter), why: `Viimases check-inis jäi kinni: ${(last.blocker || TOPICS[last.blocker_topic] || '').toLowerCase()}.` });
  else { const lb = st.checkins.find(c => c.blocker_topic)?.blocker_topic; if (lb && L[TOPIC_LESSON[lb]]) q.push({ ...describeMaterial(L[TOPIC_LESSON[lb]], null), why: `Viimases check-inis jäi kinni: ${TOPICS[lb].toLowerCase()}.` }); }
  if (mission && L[mission.lesson_ref]) {
    const ml = L[mission.lesson_ref];
    q.push({ ...describeMaterial(ml, mission.chapter), why: mission.exercise
      ? `Nädala ${week} ülesanne on koolituse harjutus ${moduleOf(ml)}.${mission.exercise}: ${mission.title.toLowerCase()}. Koolitusel tegid seda näidisfailiga, nüüd tee oma päris tööga.`
      : `Nädala ${week} ülesanne: ${mission.title.toLowerCase()}.` });
  }
  const tool = db.prepare('SELECT * FROM tools WHERE owner = ?').get(userId);
  if (tool && L.e5) q.push({ ...describeMaterial(L.e5, null), why: `Sinu tööriist "${tool.name}" on Skill. Nii muudad selle tulemuse ühtlasemaks.` });
  const out = [], ids = new Set();
  q.forEach(x => { if (ids.has(x.lesson_id)) return; if (seen.has(x.lesson_id) && x.chapter == null && !x.why.startsWith('Nädala')) return; ids.add(x.lesson_id); out.push(x); });
  return { day: dayInfo(org).DAY, week, mission: mission ? { week: mission.week, title: mission.title, exercise: mission.exercise ? `${moduleOf(L[mission.lesson_ref])}.${mission.exercise}` : null } : null, queue: out };
}

/* ---------- sisulüngad ---------- */
export function contentGaps(db) {
  const rows = gapRows(db).map(g => publicGap(g, new Date(Date.now() - 30 * 60e3).toISOString()));
  const L = lessonMap(db);
  return {
    open: rows.filter(g => g.status !== 'done'),
    done: rows.filter(g => g.status === 'done').map(g => ({ ...g, lesson_title: L[g.lesson]?.title || null }))
  };
}
const norm = s => String(s || '').toLowerCase().replace(/[^a-zäöüõšž0-9 ]/g, ' ').trim();
/** Kas tekst vastab juba teadaolevale avatud sisulüngale? Võrdleb ainult päris sõnu (ilma sünonüümideta), et "Outlooki kalender" ja "Outlooki kaustad" ei sulanduks. */
export function matchOpenGap(db, text) {
  const open = db.prepare("SELECT * FROM gaps WHERE status != 'done'").all();
  const qt = tokens(text, { synonyms: false });
  let best = null, bestScore = 0;
  for (const g of open) {
    if (norm(g.topic) === norm(text)) return g;
    const gt = tokens(g.topic, { synonyms: false }); let n = 0; qt.forEach(t => gt.has(t) && n++);
    const ratio = n / Math.max(1, Math.min(qt.size, gt.size));
    if (n >= 2 && ratio >= 0.5 && n > bestScore) { best = g; bestScore = n; }
  }
  return best;
}
/** Lisab teema lünkade nimekirja või liidab inimese olemasoleva lünga juurde. Iga inimene loeb ühe lünga juures üks kord. */
export function recordGap(db, { topic, quote, userId, today }) {
  const org = getOrg(db); const now = new Date().toISOString();
  const best = matchOpenGap(db, topic);
  if (best) {
    const already = db.prepare('SELECT 1 FROM gap_people WHERE gap_id = ? AND user_id = ?').get(best.id, userId);
    const companies = j(best.companies_json, []); if (!companies.includes(org.name)) companies.push(org.name);
    db.prepare('UPDATE gaps SET people = people + ?, companies_json = ?, updated_at = ? WHERE id = ?').run(already ? 0 : 1, JSON.stringify(companies), now, best.id);
    db.prepare('INSERT OR IGNORE INTO gap_people VALUES (?,?)').run(best.id, userId);
    return { id: best.id, topic: best.topic, merged: true };
  }
  const id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  db.prepare('INSERT INTO gaps VALUES (?,?,?,?,?,?,?,?,?)').run(id, String(topic).slice(0, 120), 1, JSON.stringify([org.name]), String(quote || '').slice(0, 160), today || org.today, 'new', null, now);
  db.prepare('INSERT OR IGNORE INTO gap_people VALUES (?,?)').run(id, userId);
  return { id, topic: String(topic).slice(0, 120), merged: false };
}
/** Kui check-in asendatakse, võetakse inimene tema vana lünga juurest maha (ja tühjaks jäänud uus lünk kustutatakse). */
export function releaseGap(db, gapId, userId) {
  if (!gapId) return;
  const still = db.prepare('SELECT 1 FROM checkins WHERE gap_id = ? AND user_id = ?').get(gapId, userId);
  if (still) return;
  const r = db.prepare('DELETE FROM gap_people WHERE gap_id = ? AND user_id = ?').run(gapId, userId);
  if (!r.changes) return;
  db.prepare('UPDATE gaps SET people = MAX(people - 1, 0) WHERE id = ?').run(gapId);
  db.prepare("DELETE FROM gaps WHERE id = ? AND people = 0 AND status = 'new'").run(gapId);
}

export function requestWorkshop(db, { userId, topic, note }) {
  const u = getUser(db, userId);
  db.prepare('INSERT INTO workshop_requests (org_id,user_id,topic,note,created_at) VALUES (?,?,?,?,?)').run(u?.org_id || null, userId, topic, note || null, new Date().toISOString());
  return { ok: true, message: 'Päring saadetud AI Eestile. Koolitaja võtab ühendust 24 tunni jooksul.' };
}

export function setFeatured(db, toolId, featured) {
  const r = db.prepare('UPDATE tools SET featured = ? WHERE id = ?').run(featured ? 1 : 0, toolId);
  return r.changes > 0;
}
