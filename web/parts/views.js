/* nav */
const ICON = {
  avaleht:'<path d="M2.5 7.5 8 3l5.5 4.5V13a.5.5 0 0 1-.5.5H9.5V10h-3v3.5H3a.5.5 0 0 1-.5-.5Z"/>',
  opi:'<rect x="2" y="3" width="12" height="9" rx="1.5"/><path d="m7 5.8 3 1.7-3 1.7Z"/>',
  tooriistad:'<path d="M9.5 2.5a3 3 0 0 0-2.8 4L2.5 10.7v2.8h2.8l4.2-4.2a3 3 0 0 0 4-2.8l-1.8 1.8-2-.5-.5-2Z"/>',
  tiim:'<circle cx="6" cy="5.5" r="2.2"/><path d="M2 13c.3-2.3 1.9-3.5 4-3.5s3.7 1.2 4 3.5"/><circle cx="11.5" cy="6" r="1.7"/><path d="M11 9.6c1.6 0 2.7.9 3 2.9"/>',
  tulemus:'<path d="M2.5 13.5h11"/><path d="M4 11V8M7 11V5M10 11V7M13 11V3.5"/>',
  lungad:'<path d="M3 3.5h10v7H8.5L5.5 13v-2.5H3Z"/><path d="M8 5.5v2.2M8 9.2v.01"/>'
};
const NAV = {
  member:[['avaleht','Avaleht'],['opi','Õppimine'],['tooriistad','Tööriistad']],
  manager:[['tiim','Tiim'],['opi','Õppimine'],['tooriistad','Tööriistad']],
  owner:[['tulemus','Tulemus'],['tiim','Tiim']],
  aieesti:[['lungad','Sisulüngad'],['opi','Õppimine']]
};
const HOME = {member:'avaleht',manager:'tiim',owner:'tulemus',aieesti:'lungad'};
const ME = {member:'u1',manager:'u2',owner:'u12',aieesti:null};
const AIE = {name:'AI Eesti', role_title:'Koolitajad ja sisu'};
function renderNav(){
  $('#nav').innerHTML = NAV[state.role].map(([k,t])=>`<button type="button" data-go="${k}" ${state.view===k||(state.view==='tund'&&k==='opi')?'aria-current="page"':''}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${ICON[k]}</svg><span>${t}</span></button>`).join('');
  $('#nav').querySelectorAll('button').forEach((b,i)=>b.title=NAV[state.role][i][1]);
  const u = ME[state.role] ? U[ME[state.role]] : AIE;
  $('#av').textContent = initials(u.name); $('#me-name').textContent = u.name; $('#me-org').textContent = u.role_title;
}

/* journey: six training Thursdays, then 90 days of use */
const SESS = ORG.sessions || [];
const PRE = SESS.length ? -dayOf(SESS[0].date) : 0;          // days from first session to course end
const SPAN = PRE + 90;
const at = d => ((Math.max(-PRE,Math.min(90,d))+PRE)/SPAN*100).toFixed(2)+'%';
function journey(id){
  const dots = id ? userStats(id).C.map(c=>`<b style="left:${at(dayOf(c.created_at))}" title="Check-in ${dateEt(c.created_at)}"></b>`).join('') : '';
  const wk = ['pühapäev','esmaspäev','teisipäev','kolmapäev','neljapäev','reede','laupäev'];
  const days = SESS.map((s,i)=>{ const l=L[s.lesson], m=modOf(l), dt=new Date(s.date+'T12:00:00');
    const tip = `${wk[dt.getDay()][0].toUpperCase()+wk[dt.getDay()].slice(1)}, ${dateEt(s.date)}\nMoodul ${m.n}: ${m.name}\n${ORG.session_time||''}, ${ORG.session_place||''}`;
    return `<button class="tday${i===0?' first':''}" type="button" style="left:${at(dayOf(s.date))};--mc:${m.c}" data-lesson="${s.lesson}" data-tip="${esc(tip)}" aria-label="${esc(tip.replace(/\n/g,'. '))}"></button>`; }).join('');
  return `<div class="journey">
    <div class="jt"><span style="left:${at(DAY)}">Täna, päev ${DAY}</span></div>
    <div class="track"><i style="width:${at(DAY)}"></i><span class="split" style="left:${at(0)}"></span>${days}${dots}<em style="left:${at(DAY)}"></em></div>
    <div class="jl"><span class="start" style="left:0">Koolitus</span><span class="mid" style="left:${at(0)}">Koolituse lõpp<span class="d">, ${dateEt(ORG.course_end_date)}</span></span><span style="right:0">Päev 90</span></div>
  </div>`;
}

/* ===== member ===== */
/* What should Mari watch next? An ordered queue, each item with the reason it is there:
   1) the blocker from her latest check-in  2) this week's task  3) the next step for her own tool. */
function nextUp(){
  const st = userStats('u1'), seen = new Set(S.progress.u1||[]);
  const week = Math.min(13, Math.floor(DAY/7)+1);
  const mission = S.missions.find(m=>m.week===week) || S.missions[S.missions.length-1];
  const live = state.checkin?.status==='done' ? state.checkin : null;
  const lastBlock = live ? live.blocker_topic : st.C.find(c=>c.blocker_topic)?.blocker_topic;
  const q = [];
  if(live && live.material_found && live.lesson_id) q.push({id:live.lesson_id, at:live.chapter||0, why:`Su check-inis jäi kinni: <b>${esc((TOPICS[lastBlock]||live.blocker||'').toLowerCase())}</b>. See video lahendab just selle.`});
  else if(!live && lastBlock) q.push({id:TOPIC_LESSON[lastBlock], at:0, why:`Su viimases check-inis jäi kinni: <b>${esc(TOPICS[lastBlock].toLowerCase())}</b>. See video lahendab just selle.`});
  const mL=L[mission.lesson_ref];
  q.push({id:mission.lesson_ref, at:mission.chapter||0, why: mission.exercise && mL
    ? `Nädala ${week} ülesanne on koolituse <b>harjutus ${modOf(mL).n}.${mission.exercise}</b>: ${esc(mission.title.toLowerCase())}. Koolitusel tegid seda näidisfailiga, nüüd tee oma päris tööga.`
    : `Nädala ${week} ülesanne on <b>${esc(mission.title.toLowerCase())}</b>. Siin näidatakse, kuidas.`});
  q.push({id:'e5', at:0, why:`Sinu <b>Pakkumuse koostaja</b> on Skill. Nii muudad selle tulemuse ühtlasemaks.`});
  const out=[], ids=new Set();
  q.forEach(x=>{ if(!L[x.id] || ids.has(x.id)) return; if(seen.has(x.id) && !x.at) return; ids.add(x.id); out.push(x); });
  return {queue:out, week};
}
function viewMember(){
  const st=userStats('u1');
  const tool = S.tools.find(x=>x.owner==='u1');
  const {queue} = nextUp();
  const first = queue[0], f = L[first.id], m = modOf(f);
  const chap = first.at && f.chapters[first.at] ? f.chapters[first.at] : null;
  return `<section class="view">
    <div class="title"><h1>Tere, Mari</h1><p>AI Max lõppes ${dateAd(ORG.course_end_date)}. Täna on päev ${DAY} 90-st ja oled sellest ajast säästnud ${fmtH(st.hours)} tundi.</p></div>
    ${journey('u1')}
    <div class="sec" id="ci">${checkinPanel()}</div>
    <div class="sec">
      <div class="sec-h"><h2>Järgmisena vaata</h2><button class="link" type="button" data-go="opi">Kõik videod</button></div>
      <div class="cont" style="--mc:${m.c}">
        ${thumb(f, first.at)}
        <div class="txt">
          <span class="mtag"><i></i>Moodul ${m.n}, ${esc(m.name)}${chap?`, peatükk ${chap.t}`:''}${chap&&chap.slides?`, slaidid ${chap.slides[0]}–${chap.slides[1]}`:''}</span>
          <h3>${esc(chap?chap.title:f.title)}</h3>
          <p class="why">${first.why}</p>
          <button class="btn" type="button" data-lesson="${f.id}" data-at="${first.at||0}" style="margin-top:6px">${chap?'Vaata peatükki':'Vaata videot, '+dur(f.duration_s)}</button>
        </div>
      </div>
      ${queue.length>1?`<div class="q">${queue.slice(1).map((x,i)=>{const l=L[x.id], mm=modOf(l), c=x.at&&l.chapters[x.at]?l.chapters[x.at]:null; return `<button class="row" type="button" style="--mc:${mm.c}" data-lesson="${l.id}" data-at="${x.at||0}">
        <span class="ix">${i+2}.</span>
        <span class="mini"><svg width="10" height="12" viewBox="0 0 16 18" aria-hidden="true"><path d="M0 0L16 9L0 18Z" fill="#ffffff"/></svg></span>
        <span><b>${esc(c?c.title:l.title)}</b><span class="s">${x.why.replace(/<[^>]+>/g,'')}</span></span>
        <span class="v">${c?`Moodul ${mm.n}, ${c.t}`:dur(l.duration_s)}</span></button>`;}).join('')}</div>`:''}
    </div>
    <div class="sec">
      <div class="sec-h"><h2>Sinu tööriist</h2></div>
      <div class="list">
        <div class="row"><span><b>${esc(tool.name)}</b><span class="s">Sinu häkatoni lahendus, jagatud tiimiga</span></span><span class="v"><b>${tool.uses}</b> kasutust, <b>${fmtH(st.hours)} h</b> säästetud</span></div>
      </div>
    </div>
  </section>`;
}
function checkinPanel(){
  const c = state.checkin;
  if(c && c.status==='done') return `
    <div class="sec-h"><h2>Check-in tehtud</h2><button class="link" type="button" id="ci-again">Muuda</button></div>
    <div class="result">
      <div class="kv">
        <div><span>Kasutusjuht</span><b>${esc(c.use_case||'Ei kasutanud sel nädalal')}</b></div>
        <div><span>Säästetud aeg</span><b class="num">${fmtH(c.hours_saved)} h</b></div>
        <div><span>Kinni jäid</span><b>${esc(c.blocker||'Ei midagi')}</b></div>
      </div>
      <div class="callout"><b>${c.blocker?'Kuidas edasi':'Järgmine samm'}</b><p>${esc(c.answer||c.next_step||'')}</p>
        ${c.material_found && L[c.lesson_id] ? (()=>{ const l=L[c.lesson_id], m=modOf(l), ch=c.chapter!=null?l.chapters[c.chapter]:null;
          return `<button class="ref" type="button" style="--mc:${m.c}" data-lesson="${l.id}" data-at="${c.chapter||0}"><span class="mini"><svg width="10" height="12" viewBox="0 0 16 18" aria-hidden="true"><path d="M0 0L16 9L0 18Z" fill="#ffffff"/></svg></span><span><b>${esc(ch?ch.title:l.title)}</b><span class="s">${ch?`Moodul ${m.n}, ${esc(l.title)}, alates ${ch.t}`:`Moodul ${m.n}, ${dur(l.duration_s)}`}</span></span></button>`; })()
        : (c.gap ? `<div class="gapnote"><b>Selle kohta videot veel pole.</b> Teema „${esc(c.gap)}” läks AI Eestile. Kui sama küsivad ka teised, teevad nad selle kohta kiirjuhendi ja saad teate.</div>` : '')}
      </div>
      ${flowStrip(c)}
      ${c.via==='mcp'?`<p class="small muted">See check-in tehti Claude'i vestluses Academy connectoriga.</p>`:''}
      ${c.demo && !window.__REC && !window.ACADEMY_API?`<p class="small muted">Näidisvastus. Päris AI vastus töötab, kui avad lehe Claude'is ja lubad selle.</p>`:''}
    </div>`;
  if(c && c.status==='thinking') return `
    <div class="sec-h"><h2>Selle nädala check-in</h2></div>
    <p class="thinking"><i></i>Loen su vastust ja otsin järgmist sammu</p>`;
  return `
    <div class="sec-h"><h2>Selle nädala check-in</h2><p>Paar lauset sellest, kuidas sel nädalal õpitut tööl rakendasid. Sellest tekib sinu ajavõit ja järgmine samm.</p></div>
    <div class="field">
      <textarea id="ci-text" aria-label="Check-in" placeholder="Näiteks: tegin pakkumuse koostajaga kolm pakkumust, säästsin umbes kaks tundi. Hinnavõrdlus Excelis jäi kinni.">${esc(c?.raw||'')}</textarea>
      <div class="field-foot">
        <span class="ex">Proovi näidet:
          <button type="button" data-fill="Tegin pakkumuse koostajaga neli pakkumust, iga kord säästsin umbes 40 minutit. Excelis kolme alltöövõtja hinnavõrdlus jäi kinni, valemid läksid sassi.">kasutasin</button>
          <button type="button" data-fill="Sel nädalal ei jõudnud AI-d kasutada, objektil oli kiire.">ei jõudnud</button>
          <button type="button" data-fill="Kasutasin Claude'i hankekirjade kokkuvõteteks, umbes tund aega säästsin. Tahtsin, et ta sorteeriks kirjad Outlookis õigetesse kaustadesse, aga ei saanud aru kuidas.">puudub materjal</button>
        </span>
        <button class="btn" type="button" id="ci-send">Saada</button>
      </div>
    </div>
    ${c?.error?`<p class="err">${esc(c.error)}</p>`:''}`;
}
/* domino: one check-in reaches four people */
function flowStrip(c){
  const eurV = Math.round(c.hours_saved*ORG.hourly_cost_eur);
  const hops = [
    {role:'manager', go:'tiim', big:`+${fmtH(c.hours_saved)} h`, txt:'Andrese tiimi vaates', sub:c.blocker?`ja takistus „${esc(TOPICS[c.blocker_topic]||'muu').toLowerCase()}” kinnijäämiste all`:'tiimi säästetud tundides'},
    {role:'owner', go:'tulemus', big:`+${eurV} €`, txt:'Toomase tasuvusarvutuses', sub:`${fmtH(c.hours_saved)} h × ${ORG.hourly_cost_eur} € tunnihind`},
    c.gap && !c.material_found
      ? {role:'aieesti', go:'lungad', big:'1 teema', txt:'AI Eesti sisulüngades', sub:`„${esc(c.gap)}”`}
      : {role:'aieesti', go:'lungad', big:'Andmed', txt:'AI Eestile', sub:'mis töötab ja mida koolitusel rõhutada'}
  ];
  return `<div class="flow" aria-label="Kuhu check-in edasi liikus">
    <span class="flow-h">Sinu üks check-in liikus edasi</span>
    <div class="hops">${hops.map((h,i)=>`<button class="hop" type="button" style="--d:${i}" data-role="${h.role}" data-to="${h.go}"><b>${h.big}</b><span>${h.txt}</span><em>${h.sub}</em></button>`).join('')}</div>
  </div>`;
}
function thumb(l,at){
  const m=modOf(l);
  return `<button class="thumb" type="button" style="--mc:${m.c}" data-lesson="${l.id}" data-at="${at||0}" aria-label="Vaata videot: ${esc(l.title)}"><span class="pb"><svg width="14" height="16" viewBox="0 0 16 18" aria-hidden="true"><path d="M0 0L16 9L0 18Z" fill="#0a0a0a"/></svg></span><span class="dur">${dur(l.duration_s)}</span></button>`;
}

/* ===== learning ===== */
function guideOrder(){
  const id = ME[state.role];
  const mine = new Set(); if(state.role==='member'){ userStats('u1').C.forEach(c=>c.blocker_topic&&mine.add(c.blocker_topic)); if(state.checkin?.blocker_topic) mine.add(state.checkin.blocker_topic); }
  const seen = new Set(S.progress[id]||[]);
  return S.lessons.filter(l=>l.kind==='explainer').map(l=>{
    let score = (l.team_views||0)/10, why = `Tiimis vaadatud ${l.team_views||0} korda`;
    if(state.role==='member' && l.topic==='Skill'){ score+=2; why='Seotud sinu tööriistaga'; }
    if(mine.has(l.topic)){ score+=3; why='Seotud sinu check-iniga'; }
    if(seen.has(l.id)){ score-=4; }
    return {l, score, why, seen:seen.has(l.id)};
  }).sort((a,b)=>b.score-a.score);
}
function viewLearn(){
  const prog = S.progress[ME[state.role]] || [];
  const rec = S.lessons.filter(l=>l.kind==='recording');
  return `<section class="view">
    <div class="title"><h1>Õppimine</h1><p>Iga koolituspäev on salvestatud ja jagatud peatükkideks. Kiirjuhendid lahendavad ühe kindla mure mõne minutiga.</p></div>
    <div class="sec ask-wrap">${searchPanel()}</div>
    <div class="sec">
      <div class="sec-h"><h2>Koolituspäevad</h2></div>
      <div class="modules">${rec.map(l=>{const m=modOf(l); const seen=prog.includes(l.id); const s=SESS.find(x=>x.lesson===l.id); return `<button class="module" type="button" style="--mc:${m.c}" data-lesson="${l.id}"><span class="no">Moodul ${m.n}${s?`, ${dateEt(s.date)}`:''}</span><b>${esc(l.title)}</b><span class="meta"><span>${l.chapters.length} peatükki${l.exercises?`, ${l.exercises.length} harjutust`:''}, ${dur(l.duration_s)}</span><span>${seen?'Vaadatud':''}</span></span></button>`;}).join('')}</div>
    </div>
    <div class="sec">
      <div class="sec-h"><h2>Kiirjuhendid</h2><p>Lühikesed videod päris murede kohta, mida õppijad on check-inides küsinud. ${state.role==='member'?'Ülal on need, mis on sulle praegu kõige olulisemad.':'Järjestatud selle järgi, kui palju tiim neid vaatab.'}</p></div>
      <div class="list">${guideOrder().map(({l,why,seen})=>{const m=modOf(l); return `<button class="row vid" type="button" style="--mc:${m.c}" data-lesson="${l.id}">
        <span class="mini"><svg width="10" height="12" viewBox="0 0 16 18" aria-hidden="true"><path d="M0 0L16 9L0 18Z" fill="#ffffff"/></svg></span>
        <span><b>${esc(l.title)}${l.is_new?' <span class="new">Uus</span>':''}</b><span class="s">${why}. Moodul ${m.n}, ${dur(l.duration_s)}</span></span>
        ${seen?'<span class="state s-ok">Vaadatud</span>':'<span class="state s-idle">Vaatamata</span>'}
      </button>`;}).join('')}</div>
    </div>
  </section>`;
}
function viewLesson(){
  const l = L[state.lesson]; const ch = l.chapters; const m = modOf(l);
  const pct = ch.length ? (state.chapter/ch.length)*100 + 4 : (state.playing?35:0);
  const rel = S.lessons.filter(x=>x.id!==l.id && x.kind==='explainer' && modOf(x).n===m.n).concat(S.lessons.filter(x=>x.id!==l.id && x.kind==='explainer' && modOf(x).n!==m.n)).slice(0,3);
  return `<section class="view" style="--mc:${m.c};gap:36px">
    <button class="link back" type="button" data-go="opi">Tagasi õppimise juurde</button>
    <div class="title"><span class="mtag"><i></i>Moodul ${m.n}, ${esc(m.name)}</span><h1>${esc(l.title)}</h1><p>${l.kind==='recording'?'Koolituspäeva salvestus':'Lühike selgitusvideo'}, ${dur(l.duration_s)}</p></div>
    <div class="player">
      <div class="screen">
        <div class="center"><div>
          <button class="pb" type="button" id="play" aria-label="${state.playing?'Peata':'Esita'}">${state.playing
            ?'<svg width="16" height="18" viewBox="0 0 18 20" aria-hidden="true"><rect x="1" width="5" height="20" fill="#0a0a0a"/><rect x="12" width="5" height="20" fill="#0a0a0a"/></svg>'
            :'<svg width="18" height="20" viewBox="0 0 16 18" aria-hidden="true"><path d="M0 0L16 9L0 18Z" fill="#0a0a0a"/></svg>'}</button>
          <span class="cap">${state.playing?'Video kohatäide. Siia tuleb koolituse salvestus.':(ch.length?esc(ch[state.chapter].title):esc(l.summary))}</span>
        </div></div>
        <div class="scrub"><i style="width:${Math.min(100,pct)}%"></i></div>
      </div>
      ${ch.length?`<div class="chapters"><h3><span>Peatükid</span>${l.slides_total?'<span>Slaidid</span>':''}</h3>${ch.map((c,i)=>`<button class="chap" type="button" data-chap="${i}" aria-current="${i===state.chapter}"><time>${c.t}</time><span>${esc(c.title)}</span>${c.slides?`<em>${c.slides[0]}–${c.slides[1]}</em>`:''}</button>`).join('')}</div>`
      :`<div class="chapters"><h3>Seotud videod</h3>${rel.map(r=>`<button class="chap" type="button" data-lesson="${r.id}"><time>${dur(r.duration_s)}</time><span>${esc(r.title)}</span></button>`).join('')}</div>`}
    </div>
    ${l.exercises ? (()=>{ const cur=ch[state.chapter]; const sl=cur&&cur.slides;
      const stTxt={done:'Tehtud koolitusel',week:'Nädala ülesanne',todo:'Tegemata'};
      return `<div class="two">
      <div class="sec"><div class="sec-h"><h2>Koolituse harjutused</h2></div>
        <p class="muted" style="max-width:62ch;margin-bottom:12px">Samad harjutused, mis koolituspäeval. Koolitusel tegid need näidisfailiga, siin teed oma päris tööga. Klõps viib videos kohta, kus harjutust selgitati.</p>
        <div class="list">${l.exercises.map(e=>`<button class="row ex${e.status==='week'?' is-week':''}" type="button" data-chap="${e.chapter}"><span><span class="exn">${m.n}.${e.n}</span>${esc(e.title)}</span><span class="v">${e.status==='week'?'<b>'+stTxt.week+'</b>':stTxt[e.status]}</span></button>`).join('')}</div>
      </div>
      <div class="sec"><div class="sec-h"><h2>Slaidid</h2></div>
        <p class="muted">${l.slides_total} slaidi. ${sl?`See peatükk on slaididel ${sl[0]}–${sl[1]}.`:''}</p>
        <div class="list" style="margin-top:12px">
          <button class="row" type="button" data-slides="${sl?sl[0]:1}"><span>${sl?`Ava slaidid ${sl[0]}–${sl[1]}`:'Ava slaidid'}</span><span class="v">PDF</span></button>
          <div class="row"><span>Promptide kogu</span><span class="v">Dokument</span></div>
          <div class="row"><span>Näidisfail harjutuseks</span><span class="v">Excel</span></div>
        </div>
      </div>
    </div>`; })() : `<div class="two">
      <div class="sec"><div class="sec-h"><h2>Kokkuvõte</h2></div><p class="muted" style="max-width:62ch">${esc(l.summary)}</p></div>
      <div class="sec"><div class="sec-h"><h2>Materjalid</h2></div>
        <div class="list"><div class="row"><span>Promptide kogu</span><span class="v">Dokument</span></div></div>
      </div>
    </div>`}
  </section>`;
}
function viewTools(){
  const mgr = state.role==='manager';
  const list = S.tools.filter(x=>x.shared||mgr).sort((a,b)=>(b.featured?1:0)-(a.featured?1:0) || b.uses-a.uses);
  const f = state.share;
  return `<section class="view">
    <div class="title"><h1>Tööriistad</h1><p>${mgr?'Kõik tiimi ehitatud Skillid ja nende kasutus. Tõsta esile need, mida tahad, et kõik kasutaksid.':'Kolleegide ehitatud Skillid, mida saad ise kasutada. Kui oled ise midagi ehitanud, jaga seda tiimiga.'}</p></div>
    <div class="sec">
      <div class="sec-h"><h2>${f?'Jaga tööriista':'Tiimi tööriistad'}</h2>${f?'':'<button class="btn" type="button" id="share-open">Jaga tööriista</button>'}</div>
      ${f?`<form class="share" id="share-form">
        <label for="sh-name">Nimi</label><input id="sh-name" required placeholder="Näiteks: Hankekirjade kokkuvõte">
        <label for="sh-what">Mida see teeb</label><input id="sh-what" required placeholder="Teeb hankekirjast poolelehelise kokkuvõtte ja tähtajad">
        <label for="sh-who">Kellele sobib</label><input id="sh-who" placeholder="Projektijuhid, hankespetsialistid">
        <label for="sh-link">Skilli fail või link</label><input id="sh-link" placeholder="Lisa .skill fail või kleebi link Claude'ist">
        <div class="share-act"><button class="btn" type="submit">Jaga tiimiga</button><button class="link" type="button" id="share-cancel">Tühista</button></div>
      </form>`:''}
      <div class="tbl"><table><thead><tr><th>Tööriist</th><th>Autor</th><th class="r">Kasutusi</th><th></th></tr></thead><tbody>
      ${list.map(x=>`<tr><td><div class="n">${esc(x.name)}${x.featured?' <span class="new">Esile tõstetud</span>':''}${x.fresh?' <span class="new">Uus</span>':''}</div><div class="t">${esc(x.description)}${!x.shared?' Pole veel jagatud.':''}</div></td><td>${esc(U[x.owner]?.name||'')}</td><td class="r">${x.uses}</td>
        <td class="r">${mgr?`<button class="btn sec" type="button" data-feature="${x.id}">${x.featured?'Eemalda esiletõst':'Tõsta esile'}</button>`:`<button class="btn sec" type="button" data-toast="${esc(x.name)} lisati sinu Claude'i">Lisa endale</button>`}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="small muted">Kasutuskorrad tulevad praegu check-inidest. Claude Enterprise'iga saab need võtta otse Claude'i kasutusandmetest.</p>
    </div>
  </section>`;
}

/* ===== manager ===== */
function weekBars(){
  const t = totals(); const W=920,H=150,base=118, x=d=>(W)*d/91;
  const max = Math.max(...t.weeks,1); let g='';
  g+=`<line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="#d1d5db"/>`;
  for(let w=0; w<13; w++){
    const cx=x(w*7+3.5), bw=x(7)*0.56, v=t.weeks[w];
    if(v>0){ const h=(base-26)*v/max; g+=`<rect x="${cx-bw/2}" y="${base-h}" width="${bw}" height="${h}" rx="2" fill="#0a0a0a"/><text x="${cx}" y="${base-h-8}" text-anchor="middle" font-size="12" fill="#475569">${fmtH(v)} h</text>`; }
    else if(w*7 >= DAY){ g+=`<rect x="${cx-bw/2}" y="${base-3}" width="${bw}" height="3" rx="1" fill="#e5e7eb"/>`; }
    if(w%2===0) g+=`<text x="${cx}" y="${base+22}" text-anchor="middle" font-size="12" fill="#6b7280">Näd ${w+1}</text>`;
  }
  g+=`<line x1="${x(DAY)}" x2="${x(DAY)}" y1="12" y2="${base}" stroke="#0a0a0a" stroke-dasharray="3 3"/><text x="${x(DAY)+6}" y="20" font-size="12" font-weight="500" fill="#0a0a0a">Täna, päev ${DAY}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Säästetud tunnid nädalate kaupa 90 päeva jooksul">${g}</svg>`;
}
function viewManager(){
  const t = totals();
  const members = S.users;
  const rows = members.map(u=>({u,...userStats(u.id)})).sort((a,b)=>({warn:0,idle:1,ok:2}[a.status]-{warn:0,idle:1,ok:2}[b.status]) || b.hours-a.hours);
  const label = {ok:['s-ok','Kasutab'],warn:['s-warn','Jäi kinni'],idle:['s-idle','Vaikne']};
  const by = {}; S.checkins.filter(c=>c.blocker_topic).forEach(c=>{ if(!by[c.blocker_topic]) by[c.blocker_topic]=new Set(); by[c.blocker_topic].add(c.user_id); });
  const topics = Object.entries(by).map(([k,v])=>[k,v.size]).sort((a,b)=>b[1]-a[1]);
  const maxT = Math.max(...topics.map(x=>x[1]),1);
  const top = topics[0];
  const quiet = rows.filter(r=>r.status==='idle').length;
  return `<section class="view">
    <div class="title"><h1>${esc(ORG.name)}</h1><p>${esc(ORG.program)} lõppes ${dateAd(ORG.course_end_date)}. Täna on päev ${DAY} 90-st.</p></div>
    <div class="figs">
      <div><b>${t.active.size} / ${members.length}</b><span>kasutasid AI-d viimasel nädalal</span></div>
      <div><b>${fmtH(t.hours)} h</b><span>säästetud kokku</span></div>
      <div><b>${S.tools.filter(x=>x.shared).length}</b><span>jagatud tööriista</span></div>
      <div><b>${quiet}</b><span>${quiet===1?'inimene on vaikne':'inimest on vaiksed'}</span></div>
    </div>
    <div class="sec"><div class="sec-h"><h2>Säästetud tunnid nädalate kaupa</h2></div><div class="bars">${weekBars()}</div></div>
    ${top?`<div class="box"><div><b>${top[1]} inimest jäid kinni teemaga „${esc(TOPICS[top[0]]).toLowerCase()}”</b><span class="muted small">AI Eesti koolitaja teeb kahetunnise töötoa teie enda failidega, kohapeal või veebis.</span></div><button class="btn" type="button" data-workshop="${esc(TOPICS[top[0]])}" data-toast="Päring saadetud AI Eestile. Vastame 24 tunni jooksul.">Küsi töötuba</button></div>`:''}
    <div class="sec">
      <div class="sec-h"><h2>Tiim</h2></div>
      <div class="tbl"><table><thead><tr><th>Inimene</th><th>Viimane check-in</th><th class="r">Säästetud</th><th>Olek</th></tr></thead><tbody>
      ${rows.map(r=>`<tr${freshFor(r.u.id)?' class="hot"':''}><td><div class="n">${esc(r.u.name)}${freshFor(r.u.id)?` <span class="new">${freshFor(r.u.id)==='mcp'?"Just Claude'ist":'Just uuendatud'}</span>`:''}</div><div class="t">${esc(r.u.role_title)}</div></td>
        <td>${r.last?`${dateEt(r.last.created_at)}<div class="t">${esc(r.last.use_case||'Ei kasutanud')}</div>`:'<span class="t">Pole veel teinud</span>'}</td>
        <td class="r">${fmtH(r.hours)} h</td>
        <td><span class="state ${label[r.status][0]}">${label[r.status][1]}</span>${r.status==='warn'?`<div class="t">${esc(TOPICS[r.last.blocker_topic])}</div>`:''}</td></tr>`).join('')}
      </tbody></table></div>
    </div>
    <div class="cols2">
      <div class="sec">
        <div class="sec-h"><h2>Kus tiim kinni jääb</h2><p>Koondatud check-inidest. Number näitab, mitu inimest on seda maininud.</p></div>
        <div class="list">${topics.map(([k,n],i)=>`<div class="row"><span>${esc(TOPICS[k])}</span><span class="v"><span class="meter ${i?'':'top'}"><i style="width:${n/maxT*100}%"></i></span><b class="num">${n}</b></span></div>`).join('')}</div>
      </div>
      <div class="sec">
        <div class="sec-h"><h2>Tiimi tööriistad</h2></div>
        <div class="list">${S.tools.slice().sort((a,b)=>b.uses-a.uses).map(x=>`<div class="row"><span><b>${esc(x.name)}</b><span class="s">${esc(U[x.owner].name)}${x.shared?'':', pole veel jagatud'}</span></span><span class="v num">${x.uses} kasutust</span></div>`).join('')}</div>
      </div>
    </div>
  </section>`;
}

/* ===== owner ===== */
function chartSVG(){
  const {pts} = projection();
  const W=920,H=300,l=60,r=12,tp=16,b=36, maxY=Math.ceil(Math.max(pts[pts.length-1].eur, own*1.2)/2000)*2000;
  const x=w=>l+(W-l-r)*w/13, y=v=>tp+(H-tp-b)*(1-v/maxY);
  let g='';
  for(let v=0; v<=maxY; v+=maxY/4){ g+=`<line x1="${l}" x2="${W-r}" y1="${y(v)}" y2="${y(v)}" stroke="#e5e7eb"/><text x="${l-12}" y="${y(v)+4}" text-anchor="end" font-size="12" fill="#6b7280">${v? Math.round(v/1000)+' 000 €' : '0 €'}</text>`; }
  for(let w=0; w<=12; w+=2) g+=`<text x="${x(w)}" y="${H-10}" text-anchor="middle" font-size="12" fill="#6b7280">${w===0?'Lõpp':'Näd '+w}</text>`;
  g+=`<line x1="${l}" x2="${W-r}" y1="${y(own)}" y2="${y(own)}" stroke="#a3621b" stroke-width="1.5"/>`;
  g+=`<text x="${W-r}" y="${y(own)-9}" text-anchor="end" font-size="12" fill="#a3621b">Omaosalus ${eur(own)}</text>`;
  const all=[{w:0,eur:0,actual:true},...pts];
  const act=all.filter(p=>p.actual), pr=all.slice(act.length-1);
  const path=a=>a.map((p,i)=>`${i?'L':'M'}${x(p.w).toFixed(1)},${y(p.eur).toFixed(1)}`).join('');
  g+=`<path d="${path(act)}L${x(act[act.length-1].w)},${y(0)}L${x(0)},${y(0)}Z" fill="#0a0a0a" fill-opacity=".06"/>`;
  g+=`<path d="${path(pr)}" fill="none" stroke="#0a0a0a" stroke-width="1.5" stroke-dasharray="5 5"/>`;
  g+=`<path d="${path(act)}" fill="none" stroke="#0a0a0a" stroke-width="2.25"/>`;
  const lp=act[act.length-1];
  g+=`<circle cx="${x(lp.w)}" cy="${y(lp.eur)}" r="4.5" fill="#0a0a0a"/><text x="${x(lp.w)}" y="${y(lp.eur)-13}" text-anchor="middle" font-size="12" font-weight="500" fill="#0a0a0a">${eur(lp.eur)}</text>`;
  const fp=pts[pts.length-1];
  g+=`<circle cx="${x(fp.w)}" cy="${y(fp.eur)}" r="4" fill="#fefefe" stroke="#0a0a0a" stroke-width="1.5"/><text x="${x(fp.w)-8}" y="${y(fp.eur)-11}" text-anchor="end" font-size="12" fill="#475569">${eur(fp.eur)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Säästetud aja väärtus nädalate kaupa võrreldes omaosalusega">${g}</svg>`;
}
function viewOwner(){
  const t = totals(), {payDay,end90} = projection(), rate=ORG.hourly_cost_eur;
  const value = t.hours*rate;
  const paid = value >= own;
  return `<section class="view">
    <div class="title"><h1>Kas AI Max tasub end ära?</h1><p>Arvutatud töötajate iganädalastest check-inidest. Tunnihind ${rate} € on ettevõtte keskmine tööjõukulu.</p></div>
    <div class="verdict">
      <div><b>${paid?'Tasunud':`Päeval ${payDay}`}</b><p>${paid?'Säästetud aja väärtus ületab juba omaosaluse.':`Selle tempoga katab säästetud aeg omaosaluse umbes ${payDay}. päeval. Täna on päev ${DAY}.`}</p></div>
      <div><b>${eur(end90)}</b><p>Prognoositav säästetud aja väärtus 90 päeva lõpuks, ${(end90/own).toLocaleString('et-EE',{maximumFractionDigits:1})} korda omaosalus.</p></div>
    </div>
    <div class="sec chart">
      <div class="sec-h"><h2>Säästetud aja väärtus</h2></div>
      ${chartSVG()}
      <div class="legend"><span><i></i>Tegelik</span><span><i class="p"></i>Prognoos praeguse tempoga</span><span><i class="c"></i>Omaosalus</span></div>
    </div>
    <div class="cols2">
      <div class="sec">
        <div class="sec-h"><h2>Arvutus</h2></div>
        <div class="list sum">
          <div class="row"><span>${esc(ORG.program)}, ${ORG.participants} osalejat</span><span class="v num">${eur(ORG.program_price_eur)}</span></div>
          <div class="row"><span>Töötukassa koolitustoetus</span><span class="v num">−${eur(ORG.subsidy_eur)}</span></div>
          <div class="row tot"><b>Omaosalus</b><span class="v num"><b>${eur(own)}</b></span></div>
          <div class="row"><span>Säästetud aeg ${DAY} päevaga</span><span class="v num">${fmtH(t.hours)} h</span></div>
          <div class="row"><span>Tunnihind</span><span class="v num">${rate} €</span></div>
          <div class="row tot"><b>Väärtus täna</b><span class="v num"><b>${eur(value)}</b></span></div>
        </div>
      </div>
      <div class="sec">
        <div class="sec-h"><h2>Kasutuselevõtt</h2></div>
        <div class="list">
          <div class="row"><span>Kasutasid AI-d viimasel nädalal</span><span class="v num"><b>${t.active.size} / ${S.users.length}</b></span></div>
          <div class="row"><span>Jagatud tööriistu</span><span class="v num"><b>${S.tools.filter(x=>x.shared).length}</b></span></div>
          <div class="row"><span>Enim aega säästab</span><span class="v"><b>Pakkumuse koostaja</b></span></div>
          <div class="row"><span>Keskmine tempo</span><span class="v num"><b>${fmtH(t.pace)} h</b> nädalas</span></div>
        </div>
      </div>
    </div>
  </section>`;
}

/* ===== AI Eesti: content gaps ===== */
function viewGaps(){
  const st = {new:['s-warn','Uus'],planned:['s-idle','Tegemisel'],done:['s-ok','Valmis']};
  const open = S.gaps.filter(g=>g.status!=='done').sort((a,b)=>(b.live?1:0)-(a.live?1:0) || b.people-a.people);
  const done = S.gaps.filter(g=>g.status==='done');
  const ppl = open.reduce((a,g)=>a+g.people,0), cos = new Set(open.flatMap(g=>g.companies)).size;
  return `<section class="view">
    <div class="title"><h1>Sisulüngad</h1><p>Teemad, millega õppijad check-inides hätta jäid ja mille kohta Academys veel materjali pole. Kogutud kõigilt klientidelt, et oleks näha, millest teha järgmine kiirjuhend või mida koolitusse lisada.</p></div>
    <div class="figs">
      <div><b>${open.length}</b><span>avatud teemat</span></div>
      <div><b>${ppl}</b><span>inimest ootab vastust</span></div>
      <div><b>${cos}</b><span>ettevõtet</span></div>
      <div><b>${done.length}</b><span>${done.length===1?'teemast on saanud video':'teemast on saanud video'}</span></div>
    </div>
    <div class="sec">
      <div class="sec-h"><h2>Avatud teemad</h2></div>
      <div class="tbl"><table><thead><tr><th>Teema</th><th class="r">Inimesi</th><th>Ettevõtted</th><th>Olek</th><th></th></tr></thead><tbody>
      ${open.map(g=>`<tr${g.live?' class="hot"':''}><td><div class="n">${esc(g.topic)}${g.live?' <span class="new">Just lisandus</span>':''}</div><div class="t">„${esc(g.quote)}”</div></td>
        <td class="r">${g.people}</td><td class="t">${esc(g.companies.join(', '))}</td>
        <td><span class="state ${st[g.status][0]}">${st[g.status][1]}</span></td>
        <td class="r">${g.status==='new'?`<button class="btn sec" type="button" data-gap="${g.id}">Tee kiirjuhend</button>`:`<button class="btn sec" type="button" data-toast="Lisatud järgmise lennu koolituskavasse">Lisa koolitusse</button>`}</td></tr>`).join('')}
      </tbody></table></div>
    </div>
    <div class="sec">
      <div class="sec-h"><h2>Lahendatud</h2></div>
      <div class="list">${done.map(g=>`<button class="row" type="button" data-lesson="${g.lesson}"><span><b>${esc(g.topic)}</b><span class="s">${g.people} inimest küsis. Nüüd kiirjuhend „${esc(L[g.lesson].title)}”, märgiga Uus.</span></span><span class="v">Vaata videot</span></button>`).join('')}</div>
    </div>
  </section>`;
}

/* ===== render / events ===== */
function render(){
  const v = state.view;
  let html='';
  if(v==='tund') html=viewLesson();
  else if(v==='opi') html=viewLearn();
  else if(v==='tooriistad') html=viewTools();
  else if(v==='tiim') html=viewManager();
  else if(v==='tulemus') html=viewOwner();
  else if(v==='lungad') html=viewGaps();
  else html=viewMember();
  $('#app').innerHTML = html + `<p class="foot-note">Näidisandmed: Kaldaranna Ehitus on väljamõeldud ettevõte.</p>`;
  renderNav();
}
function go(view){ state.view=view; state.playing=false; render(); window.scrollTo({top:0}); try{ history.replaceState(null,'','#'+view); }catch(e){} }
function setRole(r){ state.role=r; $('#role').value=r; go(HOME[r]); }
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.hidden=false; clearTimeout(toast.t); toast.t=setTimeout(()=>t.hidden=true,2600); }

document.addEventListener('click', e=>{
  const b = e.target.closest('button,a'); if(!b) return;
  if(b.id==='brand'){ e.preventDefault(); go(HOME[state.role]); return; }
  if(b.dataset.role && b.dataset.to){ state.role=b.dataset.role; $('#role').value=state.role; go(b.dataset.to); return; }
  if(b.dataset.go){ go(b.dataset.go); return; }
  if(b.dataset.lesson){ state.lesson=b.dataset.lesson; state.chapter=+(b.dataset.at||0); go('tund'); if(state.chapter){ state.playing=true; render(); } return; }
  if(b.dataset.slides){ toast(`MVP-s kohatäide. Päris versioonis avaneb slaidide PDF lehelt ${b.dataset.slides}.`); return; }
  if(b.dataset.chap){ state.chapter=+b.dataset.chap; state.playing=true; render(); if(b.classList.contains('ex')) window.scrollTo({top:0,behavior:'smooth'}); return; }
  if(b.id==='play'){ state.playing=!state.playing; render(); return; }
  if(b.dataset.fill){ $('#ci-text').value=b.dataset.fill; $('#ci-text').focus(); return; }
  if(b.dataset.toast){ toast(b.dataset.toast); return; }
  if(b.id==='ci-send'){ sendCheckin(); return; }
  if(b.id==='share-open'){ state.share=true; render(); $('#sh-name').focus(); return; }
  if(b.id==='share-cancel'){ state.share=false; render(); return; }
  if(b.dataset.workshop && window.ACADEMY_API) api('/workshops',{topic:b.dataset.workshop,user_id:'u2'}).catch(()=>{});
  if(b.dataset.feature){ const t=S.tools.find(x=>x.id===b.dataset.feature); t.featured=!t.featured; if(window.ACADEMY_API) api(`/tools/${t.id}/feature`,{featured:t.featured,user_id:'u2'}).catch(()=>{}); render(); toast(t.featured?`${t.name} on nüüd kõigile esile tõstetud`:'Esiletõst eemaldatud'); return; }
  if(b.dataset.gap){ const g=S.gaps.find(x=>x.id===b.dataset.gap); g.status='planned'; render(); toast('Kiirjuhend on tegemisel. Küsijad saavad teate, kui see valmib.'); return; }
  if(b.id==='ci-again'){ removeLive(); state.checkin={raw:state.checkin.raw}; render(); return; }
});
$('#role').addEventListener('change', e=>setRole(e.target.value));
document.addEventListener('submit', e=>{
  if(e.target.id!=='share-form') return; e.preventDefault();
  const name=$('#sh-name').value.trim(), what=$('#sh-what').value.trim(); if(!name||!what) return;
  S.tools.unshift({id:'t'+Date.now(), owner:ME[state.role]||'u1', name, description:what, shared:true, uses:0, fresh:true});
  state.share=false; render(); toast(`${name} on tiimiga jagatud`);
});
/* first-visit intro video: dims the page and plays the 1-minute walkthrough */
/* The video lives inside the page (base64) and plays from memory as a blob URL, so it never depends on
   how the host serves files (artifact viewer, file://, no byte ranges for Safari). Falls back to a data: URI. */
let introSrc = null, introData = null;
function loadIntro(){
  if(introSrc) return introSrc;
  const vt=document.createElement('video');
  const mp4 = !!vt.canPlayType('video/mp4; codecs="avc1.4D401F"');
  const type = mp4 ? 'video/mp4' : 'video/webm';
  const b64 = ((document.getElementById(mp4?'intro-b64':'intro-webm-b64')||{}).textContent||'').trim();
  introData = 'data:'+type+';base64,'+b64;
  try{
    const bin = atob(b64); const u = new Uint8Array(bin.length);
    for(let k=0;k<bin.length;k++) u[k]=bin.charCodeAt(k);
    introSrc = URL.createObjectURL(new Blob([u],{type}));
  }catch(e){ introSrc = introData; }
  const vid=$('#intro-video');
  vid.addEventListener('error', ()=>{ if(vid.src!==introData){ vid.src=introData; const pr=vid.play(); if(pr&&pr.catch) pr.catch(()=>{}); } });
  return introSrc;
}
async function openIntro(){
  if(window.__REC) return;
  const o=$('#intro'), v=$('#intro-video'); o.hidden=false; $('#intro-replay').hidden=true; $('#intro-skip').textContent='Jäta vahele';
  setTimeout(()=>$('#intro-skip').focus(),50);
  const src = loadIntro();
  if(v.getAttribute('src')!==src){ v.src=src; }
  try{ v.currentTime=0; }catch(e){}
  const pr=v.play(); if(pr && pr.catch) pr.catch(()=>{});
}

function closeIntro(){
  const o=$('#intro'), v=$('#intro-video'); v.pause(); o.hidden=true;
  try{ localStorage.setItem('academy-intro-seen','1'); }catch(e){}
}
$('#intro-video').addEventListener('timeupdate', e=>{ const v=e.target; if(v.duration) $('#intro-prog').style.width=(v.currentTime/v.duration*100)+'%'; });
$('#intro-video').addEventListener('ended', ()=>{ $('#intro-replay').hidden=false; $('#intro-skip').textContent='Alusta'; $('#intro-skip').className='btn'; });
$('#intro-skip').addEventListener('click', ()=>{ $('#intro-skip').className='btn sec'; closeIntro(); });
$('#intro-replay').addEventListener('click', openIntro);
$('#intro-sound').addEventListener('click', ()=>{ const vid=$('#intro-video'); vid.muted=false; try{ vid.currentTime=0; }catch(e){} const pr=vid.play(); if(pr&&pr.catch) pr.catch(()=>{}); });
$('#intro-video').addEventListener('volumechange', e=>{ $('#intro-sound').hidden = !e.target.muted; });
$('#intro-open').addEventListener('click', openIntro);
$('#intro').addEventListener('click', e=>{ if(e.target.id==='intro') closeIntro(); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && !$('#intro').hidden) closeIntro(); });
(function(){ let seen=false; try{ seen=localStorage.getItem('academy-intro-seen')==='1'; }catch(e){} if(!seen) setTimeout(openIntro,500); })();

/* collapsible sidebar, remembered per viewer */
function setSide(min){
  const sh=$('.shell'); sh.dataset.side = min ? 'min' : 'full';
  const t=$('#toggle'); t.setAttribute('aria-label', min?'Ava külgriba':'Peida külgriba'); t.title = (min?'Ava külgriba':'Peida külgriba')+' ( [ )';
  try{ localStorage.setItem('academy-side', min?'min':'full'); }catch(e){}
}
$('#toggle').addEventListener('click', ()=>setSide($('.shell').dataset.side!=='min'));
$('#me').addEventListener('click', ()=>{ if($('.shell').dataset.side==='min') setSide(false); });
document.addEventListener('keydown', e=>{ if(e.key==='[' && $('#intro').hidden && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) setSide($('.shell').dataset.side!=='min'); });
try{ if(localStorage.getItem('academy-side')==='min') setSide(true); }catch(e){}

