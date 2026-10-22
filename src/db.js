// Andmebaas: SQLite (Node sisseehitatud node:sqlite), üks fail data/academy.db.
// Esimesel käivitusel täidetakse see failist data/seed.json (näidisettevõte Kaldaranna Ehitus).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SEED_PATH = join(ROOT, 'data', 'seed.json');
export const DEFAULT_DB = process.env.ACADEMY_DB || join(ROOT, 'data', 'academy.db');

// Demo tokenid: igal rollil oma. Päris tootes asendab need OAuth (Claude custom connector toetab seda).
export const DEMO_TOKENS = {
  'demo-mari': 'u1',     // tiimiliige, projektijuht
  'demo-kristel': 'u3',  // tiimiliige, hankespetsialist
  'demo-andres': 'u2',   // juht
  'demo-toomas': 'u12',  // omanik
  'demo-aieesti': 'aieesti' // AI Eesti meeskond
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, program TEXT, participants INTEGER,
  program_price_eur REAL, subsidy_eur REAL, hourly_cost_eur REAL,
  course_end_date TEXT, today TEXT, session_time TEXT, session_place TEXT, sessions_json TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, org_id TEXT, name TEXT NOT NULL, role_title TEXT,
  access TEXT CHECK (access IN ('member','manager','owner','aieesti'))
);
CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, user_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS courses (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY, kind TEXT, title TEXT, position INTEGER, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY, owner TEXT, name TEXT, description TEXT,
  shared INTEGER DEFAULT 0, featured INTEGER DEFAULT 0, uses INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS checkins (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL,
  used INTEGER, use_case TEXT, hours_saved REAL DEFAULT 0,
  blocker_topic TEXT, blocker TEXT,
  raw_text TEXT, answer TEXT, lesson_id TEXT, chapter INTEGER, gap_id TEXT,
  source TEXT DEFAULT 'seed', submitted_at TEXT
);
CREATE TABLE IF NOT EXISTS gaps (
  id TEXT PRIMARY KEY, topic TEXT NOT NULL, people INTEGER DEFAULT 1, companies_json TEXT,
  quote TEXT, first_seen TEXT, status TEXT DEFAULT 'new', lesson_id TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS missions (week INTEGER PRIMARY KEY, title TEXT, lesson_ref TEXT, chapter INTEGER, exercise INTEGER);
CREATE TABLE IF NOT EXISTS progress (user_id TEXT, lesson_id TEXT, PRIMARY KEY (user_id, lesson_id));
CREATE TABLE IF NOT EXISTS workshop_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT, user_id TEXT, topic TEXT, note TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`;

export function openDb(file = DEFAULT_DB) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  const n = db.prepare('SELECT COUNT(*) AS n FROM organizations').get().n;
  if (!n) seed(db);
  return db;
}

export function seed(db, seedData = JSON.parse(readFileSync(SEED_PATH, 'utf8'))) {
  const s = seedData;
  db.exec('BEGIN');
  try {
    for (const t of ['organizations','users','tokens','courses','lessons','tools','checkins','gaps','missions','progress','workshop_requests','meta']) db.exec(`DELETE FROM ${t}`);
    const o = s.organization;
    db.prepare(`INSERT INTO organizations VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      o.id, o.name, o.program, o.participants, o.program_price_eur, o.subsidy_eur, o.hourly_cost_eur,
      o.course_end_date, o.today, o.session_time ?? null, o.session_place ?? null, JSON.stringify(o.sessions || []));
    const iu = db.prepare('INSERT INTO users VALUES (?,?,?,?,?)');
    s.users.forEach(u => iu.run(u.id, u.org_id, u.name, u.role_title, u.access));
    iu.run('aieesti', null, 'AI Eesti meeskond', 'Koolitajad ja sisu', 'aieesti');
    const it = db.prepare('INSERT INTO tokens VALUES (?,?)');
    Object.entries(DEMO_TOKENS).forEach(([t, u]) => it.run(t, u));
    const ic = db.prepare('INSERT INTO courses VALUES (?,?)');
    (s.courses || []).forEach(c => ic.run(c.id, JSON.stringify(c)));
    const il = db.prepare('INSERT INTO lessons VALUES (?,?,?,?,?)');
    s.lessons.forEach((l, i) => il.run(l.id, l.kind, l.title, i, JSON.stringify(l)));
    const ito = db.prepare('INSERT INTO tools VALUES (?,?,?,?,?,?,?)');
    s.tools.forEach(t => ito.run(t.id, t.owner, t.name, t.description, t.shared ? 1 : 0, t.featured ? 1 : 0, t.uses || 0));
    const ich = db.prepare(`INSERT INTO checkins (id,user_id,created_at,used,use_case,hours_saved,blocker_topic,blocker,source) VALUES (?,?,?,?,?,?,?,?, 'seed')`);
    s.checkins.forEach(c => ich.run(c.id, c.user_id, c.created_at, c.used ? 1 : 0, c.use_case ?? null, +c.hours_saved || 0, c.blocker_topic ?? null, c.blocker ?? null));
    const ig = db.prepare(`INSERT INTO gaps VALUES (?,?,?,?,?,?,?,?,?)`);
    s.gaps.forEach(g => ig.run(g.id, g.topic, g.people, JSON.stringify(g.companies || []), g.quote ?? null, g.first_seen ?? null, g.status || 'new', g.lesson ?? g.lesson_id ?? null, null));
    const im = db.prepare('INSERT INTO missions VALUES (?,?,?,?,?)');
    s.missions.forEach(m => im.run(m.week, m.title, m.lesson_ref, m.chapter ?? null, m.exercise ?? null));
    const ip = db.prepare('INSERT INTO progress VALUES (?,?)');
    Object.entries(s.progress || {}).forEach(([u, ls]) => ls.forEach(l => ip.run(u, l)));
    db.prepare('INSERT INTO meta VALUES (?,?)').run('me', s.me || 'u1');
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export { ROOT };
export const fileExists = existsSync;
