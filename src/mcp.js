// Academy MCP server. Iga kasutaja näeb ainult oma rolli tööriistu:
//  tiimiliige: check-in, järgmine samm, oma seis, materjali otsing
//  juht:       + tiimi ülevaade, töötoa päring, tööriista esiletõst
//  omanik:     + tasuvus (ROI)
//  AI Eesti:   sisulüngad kõigilt klientidelt, tasuvus, tiimi ülevaade
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { submitCheckin } from './checkin.js';
import { nextSteps, searchMaterial, matchOpenGap, userStats, teamOverview, roi, contentGaps, requestWorkshop, setFeatured, getOrg, dayInfo, TOPICS } from './logic.js';

const eur = n => Math.round(n).toLocaleString('et-EE') + ' €';
const h = n => (Math.round(n * 10) / 10).toLocaleString('et-EE') + ' h';
const link = (base, frag) => base ? `${base.replace(/\/$/, '')}/${frag}` : null;
const ok = (text, data) => ({ content: [{ type: 'text', text }], structuredContent: data });
const fail = text => ({ content: [{ type: 'text', text }], isError: true });

export function createMcpServer(db, user, { publicUrl = process.env.ACADEMY_PUBLIC_URL } = {}) {
  const server = new McpServer(
    { name: 'ai-eesti-academy', title: 'AI Eesti Academy', version: '0.1.0' },
    { instructions: `AI Eesti Academy: koolitusjärgne töölaud. Kasutaja on ${user.name} (${user.role_title}).
Räägi kasutajaga eesti keeles. Check-ini puhul küsi vajadusel üle, mida ta tegi ja kui palju aega see säästis, ning kutsu siis submit_checkin.
Videod ja peatükid tulevad tööriistadest; ära mõtle materjale ise välja.` }
  );
  const role = user.access;
  const inOrg = ['member', 'manager', 'owner'].includes(role);

  if (inOrg) {
    server.registerTool('submit_checkin', {
      title: 'Tee nädala check-in',
      description: `Salvestab kasutaja iganädalase check-ini AI Eesti Academysse: mida ta AI-ga tegi, kui palju aega säästis ja kus kinni jäi.
Täida struktureeritud väljad vestluse põhjal (teisenda minutid tundideks, korruta korduste arvuga). Kui kasutaja ei maininud säästetud aega, küsi enne üle.
Tagastab kohese vastuse, täpse video ja peatüki, mis takistuse lahendab, või märke, et sellist materjali veel pole (siis läheb teema AI Eestile).
Check-in jõuab kohe ka juhi, omaniku ja AI Eesti vaatesse.`,
      inputSchema: {
        text: z.string().min(8).describe('Kasutaja check-in tema enda sõnadega (1-4 lauset).'),
        used: z.boolean().optional().describe('Kas kasutas sel nädalal AI-d tööülesandes.'),
        use_case: z.string().max(80).optional().describe('Lühike kasutusjuht, max 6 sõna, nt "Pakkumuse koostamine".'),
        hours_saved: z.number().min(0).max(40).optional().describe('Säästetud aeg tundides sel nädalal.'),
        blocker: z.string().max(200).optional().describe('Kus kinni jäi, üks lühike lause. Jäta tühjaks, kui ei jäänud.'),
        blocker_topic: z.enum(['Excel', 'Andmed', 'Skill', 'Aeg', 'Muu']).optional().describe('Takistuse teema.')
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    }, async (args) => {
      try {
        const { text, ...fields } = args;
        const r = await submitCheckin(db, { userId: user.id, text, source: 'mcp', fields });
        const lines = [
          `Check-in salvestatud (${r.user.name}).`,
          `Kasutusjuht: ${r.use_case || 'ei kasutanud sel nädalal'}. Säästetud: ${h(r.hours_saved)}.${r.blocker ? ` Kinni: ${r.blocker}.` : ''}`,
          r.answer ? `Soovitus: ${r.answer}` : null,
          r.material ? `Vaata: ${r.material.title} (${r.material.where}${r.material.slides ? `, slaidid ${r.material.slides}` : ''}).${link(publicUrl, r.material.link) ? ' ' + link(publicUrl, r.material.link) : ''}` : null,
          r.gap ? `Selle kohta videot veel pole. Teema "${r.gap}" läks AI Eestile${r.gap_merged ? ' (sama on küsinud ka teised)' : ''}.` : null,
          `Nähtav: ${r.reached.join(', ')}.`
        ].filter(Boolean);
        return ok(lines.join('\n'), r);
      } catch (e) { return fail(e.message); }
    });

    server.registerTool('get_next_step', {
      title: 'Mida järgmisena vaadata',
      description: 'Kasutaja järgmised sammud Academys järjekorras: viimase check-ini takistus, nädala ülesanne (koolituse harjutus oma päris tööga) ja oma tööriista järgmine samm. Iga sammu juures on põhjus ja täpne koht videos.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    }, async () => {
      const n = nextSteps(db, user.id);
      const text = [`Päev ${n.day} 90-st, nädal ${n.week}.`, ...n.queue.map((q, i) => `${i + 1}. ${q.title} (${q.where}${q.slides ? `, slaidid ${q.slides}` : ''}). ${q.why}`)].join('\n');
      return ok(text, n);
    });

    server.registerTool('get_my_progress', {
      title: 'Minu seis',
      description: 'Kasutaja enda seis pärast koolitust: päev 90-st, säästetud tunnid kokku, viimased check-inid ja olek.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    }, async () => {
      const org = getOrg(db); const s = userStats(db, user.id); const { DAY } = dayInfo(org);
      const data = { name: user.name, organization: org.name, program: org.program, day: DAY, hours_saved: s.hours, status: s.status,
        recent: s.checkins.slice(0, 5).map(c => ({ date: c.created_at, use_case: c.use_case, hours_saved: c.hours_saved, blocker: c.blocker, source: c.source })) };
      const text = `${user.name}, ${org.program} lõppes ${org.course_end_date}. Täna on päev ${DAY} 90-st. Säästetud kokku ${h(s.hours)}.\n` +
        data.recent.map(c => `- ${c.date}: ${c.use_case || 'ei kasutanud'}, ${h(c.hours_saved)}${c.blocker ? `, kinni: ${c.blocker}` : ''}`).join('\n');
      return ok(text, data);
    });
  }

  server.registerTool('find_material', {
    title: 'Otsi videot või peatükki',
    description: 'Otsib AI Eesti koolituse salvestustest ja kiirjuhenditest sobiva video ja peatüki (koos slaidinumbritega). Kasuta lühikesi märksõnu, nt "Excel hinnavõrdlus" või "Outlook kaustad".',
    inputSchema: { query: z.string().min(2).describe('Märksõnad eesti keeles.') },
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ query }) => {
    const hits = searchMaterial(db, query, 3);
    const known = matchOpenGap(db, query);
    if (known) return ok(`Teema "${known.topic}" on AI Eesti sisulünkade nimekirjas: täpset videot selle kohta veel pole (küsinud ${known.people} inimest).` +
      (hits.length ? '\nLähimad seotud materjalid:\n' + hits.map((m, i) => `${i + 1}. ${m.title} (${m.where}${m.slides ? `, slaidid ${m.slides}` : ''})`).join('\n') : ''), { query, known_gap: known.topic, results: hits });
    if (!hits.length) return ok(`Teemal "${query}" materjali ei leitud. Kui see on päris vajadus, tee check-in ja teema läheb AI Eestile.`, { query, results: [] });
    return ok(hits.map((m, i) => `${i + 1}. ${m.title} (${m.where}${m.slides ? `, slaidid ${m.slides}` : ''})`).join('\n'), { query, results: hits });
  });

  if (['manager', 'owner', 'aieesti'].includes(role)) {
    server.registerTool('get_team_overview', {
      title: 'Tiimi ülevaade',
      description: 'Kes tiimis kasutab AI-d, kes on vaikne, kus jäädakse kinni, säästetud tunnid nädalate kaupa ja tiimi tööriistad.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    }, async () => {
      const t = teamOverview(db);
      const text = [`${t.organization}, päev ${t.day} 90-st. Kasutasid AI-d viimasel nädalal: ${t.active_last_10_days}/${t.people_total}. Säästetud kokku ${h(t.hours_saved)}. Vaikseid: ${t.quiet}.`,
        t.blockers.length ? 'Takistused: ' + t.blockers.map(b => `${b.label} (${b.people})`).join(', ') + '.' : null,
        t.suggestion,
        'Inimesed:', ...t.people.map(p => `- ${p.name}, ${p.role_title}: ${p.status_label}, ${h(p.hours_saved)}${p.last_blocker ? `, kinni: ${p.last_blocker}` : ''}`)].filter(Boolean).join('\n');
      return ok(text, t);
    });
  }

  if (['manager', 'owner'].includes(role)) {
    server.registerTool('request_workshop', {
      title: 'Küsi AI Eestilt töötuba',
      description: 'Saadab AI Eestile päringu kahetunnise töötoa jaoks teemal, millega tiim kinni jääb. Küsi kasutajalt enne saatmist kinnitust.',
      inputSchema: { topic: z.string().min(3).describe('Teema, nt "Excel ja suured tabelid".'), note: z.string().max(500).optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
    }, async ({ topic, note }) => { const r = requestWorkshop(db, { userId: user.id, topic, note }); return ok(r.message, r); });
  }
  if (role === 'manager') {
    server.registerTool('feature_tool', {
      title: 'Tõsta tööriist esile',
      description: 'Tõstab tiimi tööriista (Skilli) esile, et kõik seda näeksid, või võtab esiletõstu maha.',
      inputSchema: { tool_id: z.string().describe('Tööriista id, nt "t1" (vt get_team_overview).'), featured: z.boolean().default(true) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async ({ tool_id, featured }) => setFeatured(db, tool_id, featured) ? ok(featured ? 'Esile tõstetud.' : 'Esiletõst eemaldatud.', { tool_id, featured }) : fail('Sellist tööriista pole.'));
  }

  if (['owner', 'aieesti'].includes(role)) {
    server.registerTool('get_roi', {
      title: 'Kas koolitus tasub end ära',
      description: 'Koolituse tasuvus: omaosalus (hind miinus Töötukassa toetus), säästetud aja väärtus täna, tasuvuspäev ja prognoos 90 päeva lõpuks. Arvutatud töötajate check-inidest.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    }, async () => {
      const r = roi(db);
      const text = [`${r.program}, ${r.participants} osalejat. Omaosalus ${eur(r.own_cost_eur)} (${eur(r.price_eur)} miinus toetus ${eur(r.subsidy_eur)}).`,
        `Päev ${r.day}: säästetud ${h(r.hours_saved)}, väärtus ${eur(r.value_today_eur)} (tunnihind ${r.hourly_cost_eur} €).`,
        r.paid_back ? 'Koolitus on end juba ära tasunud.' : `Selle tempoga tasub end ära umbes ${r.payback_day}. päeval.`,
        `Prognoos 90 päeva lõpuks: ${eur(r.projected_value_day90_eur)}, ${r.projected_multiple.toLocaleString('et-EE')} korda omaosalus.`,
        `Kasutasid AI-d viimasel nädalal: ${r.active_last_10_days}/${r.people}.`].join('\n');
      return ok(text, r);
    });
  }

  if (role === 'aieesti') {
    server.registerTool('get_content_gaps', {
      title: 'Sisulüngad',
      description: 'Teemad, mille kohta kõigi klientide check-inides abi küsitakse, aga videot veel pole. Järjestatud küsijate arvu järgi. Sellest selgub, millest teha järgmine kiirjuhend.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    }, async () => {
      const g = contentGaps(db);
      const text = ['Avatud:', ...g.open.map(x => `- ${x.topic}: ${x.people} inimest, ${x.companies.join(', ')}${x.status === 'planned' ? ' (töös)' : ''}. "${x.quote}"`),
        'Lahendatud:', ...g.done.map(x => `- ${x.topic} → kiirjuhend "${x.lesson_title}"`)].join('\n');
      return ok(text, g);
    });
  }

  server.registerPrompt('nadala-check-in', {
    title: 'Nädala check-in',
    description: 'Claude küsib kaks lühikest küsimust ja salvestab check-ini Academysse.'
  }, () => ({
    messages: [{ role: 'user', content: { type: 'text', text:
      'Teeme mu AI Eesti Academy nädala check-ini. Küsi minult ükshaaval: 1) mida ma sel nädalal AI-ga tegin ja kui palju aega see säästis, 2) kas jäin millegagi kinni. Siis salvesta see tööriistaga submit_checkin ja ütle mulle vastus ning video, mida vaadata.' } }]
  }));

  return server;
}

export { TOPICS };
