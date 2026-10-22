const S = JSON.parse(document.getElementById('seed').textContent);
const ORG = S.organization;
const TODAY = new Date(ORG.today+'T12:00:00');
const END = new Date(ORG.course_end_date+'T12:00:00');
const DAY = Math.round((TODAY-END)/864e5);           // päev pärast koolitust
const own = ORG.program_price_eur - ORG.subsidy_eur; // omaosalus
const L = Object.fromEntries(S.lessons.map(l=>[l.id,l]));
const U = Object.fromEntries(S.users.map(u=>[u.id,u]));
const TOPICS = {Excel:"Excel ja suured tabelid",Andmed:"Mida tohib Claude'iga jagada",Skill:"Skill annab ebaühtlase tulemuse",Aeg:"Pole aega uut proovida",Muu:"Muu"};
const MOD = {l1:{n:1,c:'#2E4A3B',name:'Claude Chat'},l2:{n:2,c:'#8B4A2F',name:'Claude Cowork'},l3:{n:3,c:'#2F4858',name:'Claude ja Microsoft 365'},l4:{n:4,c:'#7A5C1E',name:'Claude Design'},l5:{n:5,c:'#4D5A2C',name:'Claude Code'},l6:{n:6,c:'#6A2C39',name:'Häkaton'}};
const PARENT = {e1:'l2',e2:'l3',e3:'l3',e4:'l3',e5:'l2',e6:'l1'};
const modOf = l => MOD[l.kind==='recording' ? l.id : PARENT[l.id]] || {n:0,c:'#141416',name:''};
const TOPIC_LESSON = {Excel:"e2",Andmed:"e4",Skill:"e5",Aeg:"e3",Muu:"l1"};
const state = { role:'member', view:'avaleht', lesson:null, chapter:0, checkin:null, playing:false };

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtH = h => (Math.round(h*10)/10).toLocaleString('et-EE',{maximumFractionDigits:1});
const eur = n => Math.round(n).toLocaleString('et-EE')+' €';
const dur = s => { const h=Math.floor(s/3600), m=Math.floor(s%3600/60), x=s%60; return h? `${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}` : `${m}:${String(x).padStart(2,'0')}`; };
const ADESS={jaanuar:'jaanuaril',veebruar:'veebruaril',märts:'märtsil',aprill:'aprillil',mai:'mail',juuni:'juunil',juuli:'juulil',august:'augustil',september:'septembril',oktoober:'oktoobril',november:'novembril',detsember:'detsembril'};
const dateAd = d => { const [n,m]=dateEt(d).split(' '); return n+' '+(ADESS[m]||m); };
const dateEt = d => new Date(d+'T12:00:00').toLocaleDateString('et-EE',{day:'numeric',month:'long'});
const dayOf = d => Math.round((new Date(d+'T12:00:00')-END)/864e5);
const initials = n => n.split(' ').map(x=>x[0]).join('');

