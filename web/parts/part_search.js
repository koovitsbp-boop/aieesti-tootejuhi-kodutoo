/* ===== Küsi Academyst: otsing, mis saab aru ka kirjavigadega ===== */
const SEARCH_SYN = {excel:['tabel','valem','hinnavordlus'],tabel:['excel'],valem:['excel'],hinnavordlus:['excel','pakkumus'],
  outlook:['kiri','postkast'],kiri:['outlook'],kirjad:['outlook'],postkast:['outlook'],mail:['outlook','kiri'],
  protokoll:['koosolek','teams'],koosolek:['protokoll','teams'],teams:['koosolek','protokoll'],
  leping:['pdf','dokument'],pdf:['leping','dokument'],andmed:['klassifikatsioon','tohib'],isikukood:['andmed','klassifikatsioon','tohib'],
  konfidentsiaal:['andmed','klassifikatsioon'],tohib:['andmed','klassifikatsioon'],skill:['oskus'],prompt:['juhis'],
  paevik:['objektipaevik','haalsonum'],haal:['haalsonum'],prototuup:['artifacts','prototuup'],kood:['code']};
const SEARCH_STOP = new Set('kuidas kas mis mida kus kes millal miks ja ning et kui aga see seda selle sellest oma ei ole on ka siis veel nagu mul minu meil teha teen tahan saan saab vaja abi tee tehe claude claudeiga claudei ai abil ehk voi'.split(' '));
const fold = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/š/g,'s').replace(/ž/g,'z');
function sTokens(text){ return fold(text).split(/[^a-z0-9]+/).filter(w=>w.length>2 && !SEARCH_STOP.has(w)); }
function editDist(a,b){ if(Math.abs(a.length-b.length)>2) return 9; const d=[...Array(b.length+1).keys()];
  for(let i=1;i<=a.length;i++){ let prev=d[0]; d[0]=i; for(let j=1;j<=b.length;j++){ const t=d[j]; d[j]=Math.min(d[j]+1,d[j-1]+1,prev+(a[i-1]===b[j-1]?0:1)); prev=t; } } return d[b.length]; }
function wordMatch(q,w){
  const a=q.slice(0,7), b=w.slice(0,7);
  if(a===b || (a.length>=4 && (w.startsWith(a)||q.startsWith(b)) )) return 1;
  const lim = Math.min(a.length,b.length) >= 6 ? 2 : 1;
  return Math.min(a.length,b.length) >= 4 && editDist(a,b) <= lim ? 0.8 : 0;
}
function synHit(t,k){ return wordMatch(t,k)===1 || (Math.min(t.length,k.length)>=5 && editDist(t.slice(0,7),k.slice(0,7))<=1); }
function expandQuery(q){ const out=new Set(sTokens(q)); [...out].forEach(t=>{ Object.entries(SEARCH_SYN).forEach(([k,v])=>{ if(synHit(t,k)) v.forEach(x=>out.add(x)); }); }); return [...out]; }
function searchDocs(){
  const docs=[];
  S.lessons.forEach(l=>{
    if(l.kind==='explainer') docs.push({l,at:null,strong:sTokens(l.title),weak:sTokens(`${l.summary||''} ${l.topic?TOPICS[l.topic]:''}`)});
    (l.chapters||[]).forEach((c,i)=>docs.push({l,at:i,strong:sTokens(c.title),weak:sTokens(`${l.title} ${l.summary||''}`)}));
  });
  return docs;
}
function scoreTokens(q, strong, weak){ let s=0; q.forEach(t=>{ let best=0; strong.forEach(w=>best=Math.max(best,wordMatch(t,w)*2)); weak.forEach(w=>best=Math.max(best,wordMatch(t,w))); s+=best; }); return s; }
function openGapFor(query){
  const q=sTokens(query); let best=null, bs=0;
  S.gaps.filter(g=>g.status!=='done').forEach(g=>{ const gt=sTokens(g.topic); let n=0; q.forEach(t=>{ if(gt.some(w=>wordMatch(t,w)>=0.8)) n++; }); if(n>=2 && n>bs){ best=g; bs=n; } });
  return best;
}
function localSearch(query){
  const q=expandQuery(query);
  const hits=searchDocs().map(d=>({...d,score:scoreTokens(q,d.strong,d.weak)+(d.l.kind==='explainer'?0.25:0)}))
    .filter(h=>h.score>=2).sort((a,b)=>b.score-a.score);
  const top = hits.length ? hits[0].score : 0;
  const seen=new Set(), out=[];
  hits.filter(h=>h.score>=Math.max(2, top*0.6)).forEach(h=>{ const k=h.l.id+':'+h.at; if(!seen.has(k) && out.length<3){ seen.add(k); out.push({lesson_id:h.l.id,chapter:h.at}); } });
  return out;
}
async function claudeSearch(query){
  const sample = await samplePromise; if(!sample) return null;
  const gaps = S.gaps.filter(g=>g.status!=='done').map(g=>`- ${g.topic}`).join('\n');
  const prompt = `Sa oled AI Eesti Academy otsing. Kasutaja otsib koolitusmaterjalist. Tekstis võib olla kirjavigu, saa aru, mida ta mõtleb.
Otsing: """${query}"""
Vali allolevatest materjalidest kuni 3 kõige sobivamat (video id ja vajadusel peatüki number nurksulgudest). Vali ainult päriselt sobivad. Kui teema on allolevas puuduvate teemade nimekirjas või sobivat materjali pole, jäta results tühjaks.
Vasta AINULT JSON-iga: {"understood": "mida kasutaja otsib, parandatud kirjavigadega, max 8 sõna", "results": [{"lesson_id": "...", "chapter": number või null, "why": "max 10 sõna, miks see sobib"}], "gap_topic": "kui sobivat pole, teema max 8 sõna, muidu null"}
Puuduvad teemad (videot pole):
${gaps}
Materjalid:
${materialList()}`;
  try{ return await sample.json(prompt,{modelTier:'quick'}); }catch(e){ return null; }
}
async function runSearch(query){
  query=String(query||'').trim();
  if(query.length<2){ state.search={q:query}; render(); return; }
  state.search={q:query,status:'thinking'}; render();
  let out = await claudeSearch(query), engine='claude';
  let results=[];
  if(out && Array.isArray(out.results)){
    results = out.results.filter(r=>L[r.lesson_id]).map(r=>({lesson_id:r.lesson_id, chapter: Number.isInteger(+r.chapter) && L[r.lesson_id].chapters?.[+r.chapter] ? +r.chapter : null, why:r.why?String(r.why):''})).slice(0,3);
  } else { engine='local'; out=null; results=localSearch(query); }
  const known = openGapFor(query);
  if(known && engine==='local') results=[];
  const cap = t => t ? t.charAt(0).toUpperCase()+t.slice(1) : t;
  const gapTopic = results.length ? null : (known ? known.topic : cap(out?.gap_topic || query));
  state.search={q:query,status:'done',results,understood:out?.understood||null,gap:gapTopic,known:!!known,knownPeople:known?known.people:0,sent:false};
  render();
}
async function reportSearchGap(){
  const s=state.search; if(!s || !s.gap || s.sent) return;
  if(window.ACADEMY_API){
    try{ await api('/gaps',{topic:s.gap,quote:s.q,user_id:ME[state.role]||'u1'}); await syncState(true); }catch(e){ toast('Saatmine ebaõnnestus. Proovi uuesti.'); return; }
  } else {
    const g=S.gaps.find(x=>x.status!=='done' && x.topic===s.gap);
    if(g){ if(!g.live){ g.people+=1; g.live=true; } }
    else S.gaps.unshift({id:'live-s'+Date.now(),topic:s.gap,people:1,companies:[ORG.name],quote:s.q.slice(0,140),first_seen:ORG.today,status:'new',live:true});
  }
  state.search={...s,sent:true}; render(); toast('Teema läks AI Eestile');
}
function searchPanel(){
  const s=state.search||{};
  const res = s.status==='thinking' ? `<p class="thinking"><i></i>Otsin salvestustest ja kiirjuhenditest</p>`
    : s.status==='done' ? `
      ${s.understood?`<p class="small muted">Otsisin: ${esc(s.understood)}</p>`:''}
      ${s.results.length ? `<div class="list">${s.results.map(r=>{ const l=L[r.lesson_id], m=modOf(l), c=r.chapter!=null?l.chapters[r.chapter]:null;
        return `<button class="row vid" type="button" style="--mc:${m.c}" data-lesson="${l.id}" data-at="${r.chapter||0}">
          <span class="mini"><svg width="10" height="12" viewBox="0 0 16 18" aria-hidden="true"><path d="M0 0L16 9L0 18Z" fill="#ffffff"/></svg></span>
          <span><b>${esc(c?c.title:l.title)}</b><span class="s">${c?`Moodul ${m.n}, ${esc(l.title)}, alates ${c.t}${c.slides?`, slaidid ${c.slides[0]}–${c.slides[1]}`:''}`:`Kiirjuhend, ${dur(l.duration_s)}, moodul ${m.n}`}${r.why?`. ${esc(r.why)}`:''}</span></span>
          <span class="state s-idle">${c?'Peatükk':'Video'}</span></button>`; }).join('')}</div>`
      : `<div class="gapnote"><b>Selle kohta videot veel pole.</b> ${s.known?`Seda on küsinud juba ${s.knownPeople} inimest ja teema on AI Eesti nimekirjas.`:'Kui sellest on sulle päriselt abi, anna AI Eestile teada. Kui sama küsivad ka teised, teevad nad selle kohta kiirjuhendi.'}
          <div style="margin-top:10px">${s.sent?'<span class="small">Teema läks AI Eestile. Saad teate, kui video valmib.</span>':`<button class="btn sec" type="button" id="ask-gap">${s.known?'Mina vajan ka':'Anna AI Eestile teada'}</button>`}</div></div>`}`
    : '';
  return `<form class="ask" id="ask-form" role="search">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="6"/><path d="M13.5 13.5L18 18"/></svg>
      <input id="ask-q" type="search" autocomplete="off" aria-label="Otsi koolitustest" placeholder="Mida otsid? Näiteks: kuidas exelis kolme pakumust võrrelda" value="${esc(s.q||'')}">
      <kbd aria-hidden="true">/</kbd>
      <button class="btn" type="submit">Otsi</button>
    </form>
    ${res?`<div class="ask-res" aria-live="polite">${res}</div>`:''}`;
}
document.addEventListener('submit', e=>{ if(e.target.id!=='ask-form') return; e.preventDefault(); runSearch($('#ask-q').value); });
document.addEventListener('click', e=>{ if(e.target.closest('#ask-gap')) reportSearchGap(); });
document.addEventListener('keydown', e=>{
  if(e.key!=='/' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || !$('#intro').hidden) return;
  if(!NAV[state.role].some(([k])=>k==='opi')) return;
  e.preventDefault(); if(state.view!=='opi') go('opi'); const i=$('#ask-q'); if(i){ i.focus(); i.select(); }
});
