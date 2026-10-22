/* derived numbers */
function totals(){
  const C = S.checkins;
  const hours = C.reduce((a,c)=>a+(+c.hours_saved||0),0);
  const weeks = []; for(let w=0; w<13; w++) weeks.push(0);
  C.forEach(c=>{ const w=Math.min(12,Math.floor((dayOf(c.created_at)-1)/7)); weeks[w]+= +c.hours_saved||0; });
  const doneWeeks = Math.floor(DAY/7);   // only completed weeks set the pace; the running week still counts in total hours
  const recent = weeks.slice(0, Math.max(1,doneWeeks)).filter(Boolean);
  const pace = recent.length? recent.slice(-2).reduce((a,b)=>a+b,0)/Math.min(2,recent.length) : 0;
  const active = new Set(C.filter(c=>c.used && DAY-dayOf(c.created_at) <= 10).map(c=>c.user_id));
  return {hours, weeks, doneWeeks, pace, active};
}
function userStats(id){
  const C = S.checkins.filter(c=>c.user_id===id).sort((a,b)=>a.created_at<b.created_at?1:-1);
  const hours = C.reduce((a,c)=>a+(+c.hours_saved||0),0);
  const last = C[0];
  let status = 'idle';
  if(last && DAY-dayOf(last.created_at) <= 10) status = last.blocker_topic ? 'warn' : 'ok';
  return {C, hours, last, status};
}

