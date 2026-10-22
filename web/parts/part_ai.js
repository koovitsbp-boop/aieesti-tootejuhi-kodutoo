/* ===== AI check-in ===== */
let samplePromise = (window.claude && window.claude.use) ? window.claude.use('sample').catch(()=>null) : Promise.resolve(null);
function removeLive(){ S.checkins = S.checkins.filter(c=>c.id!=='live'); S.gaps = S.gaps.filter(g=>g.id!=='live'); S.gaps.forEach(g=>{ if(g.live){ g.people -= 1; g.live=false; } }); }
function materialList(){
  return S.lessons.map(l=>{
    const ch = (l.chapters||[]).map((c,i)=>`    [${i}] ${c.t} ${c.title}`).join('\n');
    return `${l.id}: ${l.title} (${l.summary})${ch?'\n'+ch:''}`;
  }).join('\n');
}
function buildPrompt(text){
  return `Sa oled AI Eesti Academy abiline. Töötaja kirjutas oma iganädalase check-ini pärast AI koolitust.
Töötaja: ${U.u1.name}, ${U.u1.role_title}, ehitusettevõte. Tema tööriist: Pakkumuse koostaja (Claude Skill).

Check-in:
"""${text}"""

Ülesanne:
1. Tee check-inist kirje (kasutus, säästetud tunnid, takistus).
2. Kui ta jäi millegagi hätta, vasta talle kohe 2–3 lausega, kuidas edasi minna.
3. Otsi allolevatest materjalidest video ja peatükk, mis tema takistust kõige paremini lahendab. Vali ainult siis, kui see päriselt sobib. Kui sobivat materjali pole, pane "material_found": false ja kirjelda puuduvat teemat lühidalt väljas "gap".

Vasta AINULT ühe JSON objektiga, eesti keeles:
{"used": true/false,
 "use_case": lühike kasutusjuht max 6 sõna või null,
 "hours_saved": number tundides (minutid teisenda; kui ei kasutanud, 0),
 "blocker": lühike lause, mis takistas, või null,
 "blocker_topic": üks neist: "Excel","Andmed","Skill","Aeg","Muu" või null,
 "answer": 2–3 lauset sina-vormis, praktiline vastus tema takistusele (või järgmine samm, kui takistust polnud),
 "material_found": true/false,
 "lesson_id": video id või null,
 "chapter": peatüki number nurksulgudest või null,
 "gap": puuduva materjali teema max 8 sõna või null}

Materjalid (video id, pealkiri, peatükid):
${materialList()}`;
}
function fallback(text){
  const t=text.toLowerCase();
  const none=/ei jõudnud|ei kasutanud|ei saanud|polnud aega/.test(t);
  let h=0; const mm=[...t.matchAll(/(\d+(?:[.,]\d+)?)\s*(min|tund|h\b)/g)];
  mm.forEach(m=>{ const v=parseFloat(m[1].replace(',','.')); h+= m[2]==='min'? v/60 : v; });
  const times=t.match(/(kolm|neli|viis|kaks|\d+)\s+(pakkumust|korda|kirja)/); const n={kaks:2,kolm:3,neli:4,viis:5}[times?.[1]]||parseInt(times?.[1])||1;
  if(/iga kord|igaühe/.test(t)) h*=n;
  if(!h && /poolteist tundi/.test(t)) h=1.5;
  if(!h && /\btund|\btunni/.test(t)) h=1;
  if(!h && !none) h=1;
  if(/outlook|kaust|reegl/.test(t)) return {used:true,use_case:'E-kirjade kokkuvõtted',hours_saved:Math.round(h*2)/2,blocker:'Outlooki reeglid ja kaustad jäid segaseks',blocker_topic:'Muu',
    answer:'Claude ise Outlooki reegleid ei loo, aga oskab need sulle välja kirjutada. Kirjelda talle, millised kirjad kuhu peavad minema, ja palu samm-sammult juhend Outlooki reeglite seadistamiseks.',
    material_found:false,lesson_id:null,chapter:null,gap:'Outlooki reeglid ja kaustade korrastamine',demo:true};
  const topic = /excel|tabel|valem/.test(t)?'Excel':/andme|konfidents|tohib/.test(t)?'Andmed':/skill|ebaühtlane|erinev tulemus/.test(t)?'Skill':none?'Aeg':null;
  const ans={Excel:"Lase Claude'il kõigepealt kolm pakkumust ühte ühtsesse tabelisse tõsta ja alles siis võrrelda. Kui valemid lähevad sassi, palu tal näidata iga valemit eraldi ja kontrolli üht rida käsitsi.",
    Aeg:'Pane kalendrisse reedeks 20 minutit ja tee üks pakkumus pakkumuse koostajaga. Väike regulaarne samm on parem kui suur kord kuus.',
    Andmed:'Kliendi nimed ja hinnad võid jagada, isikukoodid ja pangaandmed mitte. Vaata klassifikatsiooni peatükki, seal on täpne nimekiri.',
    Skill:'Lisa Skillile kaks head näidet varasematest pakkumustest. Siis on tulemus palju ühtlasem.'};
  const ref={Excel:['l3',0],Aeg:['e3',null],Andmed:['l3',2],Skill:['e5',null]}[topic]||['l2',2];
  return {used:!none,use_case:none?null:'Pakkumuse koostamine',hours_saved:Math.round(h*2)/2,blocker:topic&&!none?'Exceli hinnavõrdlus jäi kinni':(none?'Ei leidnud aega':null),
    blocker_topic:topic,answer:ans[topic]||'Proovi järgmisel nädalal oma tööriista ka ühe uue ülesandega.',material_found:true,lesson_id:ref[0],chapter:ref[1],gap:null,demo:true};
}
async function sendCheckin(){
  const text = $('#ci-text').value.trim();
  if(text.length<8){ state.checkin={raw:text,error:'Kirjuta paar lauset: mida tegid ja kui palju aega see säästis.'}; render(); $('#ci-text').focus(); return; }
  state.checkin={raw:text,status:'thinking'}; render();
  if(window.ACADEMY_API){
    try{
      const r = await api('/checkins',{user_id:'u1',text});
      await syncState(true);
      state.checkin = {...r, raw:text, status:'done'};
    }catch(e){ state.checkin={raw:text,error:e.message||'Salvestamine ebaõnnestus. Proovi uuesti.'}; }
    render(); return;
  }
  if(window.__REC) await new Promise(r=>setTimeout(r,1500));
  let out=null;
  const sample = await samplePromise;
  if(sample){
    try{ out = await sample.json(buildPrompt(text), {modelTier:'quick'}); }
    catch(e){ out=null; }
  }
  if(!out || typeof out!=='object') out = fallback(text);
  out.hours_saved = Math.max(0, Math.min(40, Number(out.hours_saved)||0));
  if(out.blocker_topic && !TOPICS[out.blocker_topic]) out.blocker_topic='Muu';
  if(!L[out.lesson_id]) { out.lesson_id=null; out.material_found=false; }
  const l = out.lesson_id ? L[out.lesson_id] : null;
  out.chapter = (l && Number.isInteger(+out.chapter) && l.chapters[+out.chapter]) ? +out.chapter : null;
  if(!out.material_found && !out.gap && out.blocker) out.gap = out.blocker;
  removeLive();
  S.checkins.push({id:'live',user_id:'u1',created_at:ORG.today,used:!!out.used,use_case:out.use_case,hours_saved:out.hours_saved,blocker_topic:out.blocker_topic||null,blocker:out.blocker||null});
  if(!out.material_found && out.gap){
    const g = S.gaps.find(x=>x.status!=='done' && x.topic.toLowerCase()===String(out.gap).toLowerCase());
    if(g){ g.people += 1; g.live = true; }
    else S.gaps.unshift({id:'live',topic:String(out.gap),people:1,companies:[ORG.name],quote:text.slice(0,140),first_seen:ORG.today,status:'new',live:true});
  }
  state.checkin={...out,raw:text,status:'done'};
  render();
}

/* ===== backend (kui leht tuleb Academy serverist) ===== */
function freshFor(uid){ const c=S.checkins.filter(x=>x.user_id===uid && (x.id==='live'||x.fresh)).pop(); return c ? (c.source||'web') : null; }
async function api(path, body){
  const r = await fetch(window.ACADEMY_API+path, body ? {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)} : {});
  const d = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.error||('HTTP '+r.status));
  return d;
}
let lastVersion = S.version || null; const seenIds = new Set(S.checkins.map(c=>c.id));
function checkinFromServer(c){ const d=c.detail||{}; return {id:c.id,used:c.used,use_case:c.use_case,hours_saved:c.hours_saved,blocker:c.blocker,blocker_topic:c.blocker_topic,
  answer:d.answer,material_found:!!d.lesson_id,lesson_id:d.lesson_id,chapter:d.chapter,gap:d.gap,raw:d.raw,via:c.source,status:'done'}; }
function myWeekCheckin(){ const w=Math.floor((DAY-1)/7); return S.checkins.filter(c=>c.user_id==='u1' && c.source && c.source!=='seed' && Math.floor((dayOf(c.created_at)-1)/7)===w).pop(); }
async function syncState(quiet){
  const s = await api('/state');
  lastVersion = s.version;
  const fresh = s.checkins.filter(c=>!seenIds.has(c.id));
  ['checkins','gaps','tools','progress','missions'].forEach(k=>{ S[k]=s[k]; });
  s.checkins.forEach(c=>seenIds.add(c.id));
  if(!quiet) fresh.filter(c=>c.source==='mcp').forEach(c=>{
    toast(`Uus check-in Claude'ist: ${U[c.user_id]?.name||''}, ${fmtH(c.hours_saved)} h`);
    if(c.user_id==='u1') state.checkin = checkinFromServer(c);
  });
  return fresh;
}
if(window.ACADEMY_API){
  const mine = myWeekCheckin(); if(mine && mine.detail) state.checkin = checkinFromServer(mine);
  setInterval(async ()=>{
    try{
      const {version} = await api('/version'); if(version===lastVersion) return;
      await syncState(false);
      const typing = document.activeElement && document.activeElement.id==='ci-text' && document.activeElement.value;
      if(!typing) render();
    }catch(e){}
  }, 2500);
}

/* boot */
(function(){
  const deep=(location.hash||'').match(/^#tund\/(\w+)\/(\d+)/);
  if(deep && L[deep[1]]){ state.lesson=deep[1]; state.chapter=+deep[2]; state.view='tund'; state.playing=state.chapter>0; }
  const h=(location.hash||'').slice(1);
  const map={avaleht:'member',opi:'member',tooriistad:'member',tiim:'manager',tulemus:'owner',lungad:'aieesti'};
  if(map[h]){ state.role=map[h]; $('#role').value=state.role; state.view=h; }
  render();
})();
