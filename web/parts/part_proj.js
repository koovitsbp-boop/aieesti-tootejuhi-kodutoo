/* ===== owner ===== */
function projection(){
  const t = totals(), rate = ORG.hourly_cost_eur;
  const pts = []; let cum = 0;
  for(let w=0; w<13; w++){ const part = w===12 ? (90-84)/7 : 1; cum += (w < t.doneWeeks ? t.weeks[w] : t.pace)*part; pts.push({w:w+part, eur:cum*rate, actual: w < t.doneWeeks}); }
  let payDay = null; let c=0;
  for(let d=1; d<=90 && payDay===null; d++){
    const w = Math.floor((d-1)/7);
    const perDay = (w < t.doneWeeks ? t.weeks[w] : t.pace)/7;
    c += perDay*rate; if(c >= own) payDay = d;
  }
  const end90 = pts[pts.length-1].eur;
  return {pts, payDay, end90};
}
