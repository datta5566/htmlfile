(()=>{'use strict';
const CONFIG_KEY='dk_quality_cloud_config_v1';
const SYNC_KEY='dk_quality_cloud_sync_v1';
const cfg=()=>JSON.parse(localStorage.getItem(CONFIG_KEY)||'{}');
const saveCfg=x=>localStorage.setItem(CONFIG_KEY,JSON.stringify(x));
const state=()=>JSON.parse(localStorage.getItem(SYNC_KEY)||'{}');
const saveState=x=>localStorage.setItem(SYNC_KEY,JSON.stringify(x));
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function apiUrl(){const c=cfg();return (c.url||'').replace(/\/$/,'')+'/rest/v1/quality_inspections';}
function headers(){const c=cfg();return {'apikey':c.key||'','Authorization':'Bearer '+(c.key||''),'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=representation'};}
function getRecords(){return window.DKQualityInspection?.getRecords?window.DKQualityInspection.getRecords():[]}
function normalize(rows){const map=new Map();rows.filter(x=>x&&typeof x.id==='string').forEach(x=>{const d=x.data&&typeof x.data==='object'?x.data:x;map.set(x.id,d)});return Array.from(map.values())}
function mergeLocalCloud(local,cloud){
 const map=new Map(local.map(x=>[x.id,x]));
 cloud.forEach(x=>{
   const old=map.get(x.id);
   const ot=new Date(old?.updatedAt||old?.audit?.updatedAt||old?.savedAt||old?.createdAt||0).getTime();
   const nt=new Date(x?.updatedAt||x?.audit?.updatedAt||x?.savedAt||x?.createdAt||0).getTime();
   if(!old||nt>=ot) map.set(x.id,x);
 });
 return Array.from(map.values());
}
function setStatus(msg,ok=false){const el=document.getElementById('cloudSyncStatus');if(el){el.textContent=msg;el.className='cloud-status '+(ok?'ready':'')}saveState({...state(),message:msg,lastActionAt:new Date().toISOString()})}
function render(){
 if(document.getElementById('cloudSync'))return;
 const nav=document.querySelector('.tabs'),main=document.querySelector('main');if(!nav||!main)return;
 const b=document.createElement('button');b.dataset.tab='cloudSync';b.textContent='Cloud Sync';nav.appendChild(b);
 const s=document.createElement('section');s.id='cloudSync';s.className='tab';s.innerHTML=`
 <div class="section-head"><div><h2>Cloud Sync</h2><p>Optional cloud backup for the same Quality Inspection System project. Local history remains the primary working copy.</p></div><span id="cloudSyncStatus" class="cloud-status">Not configured</span></div>
 <div class="grid">
  <article class="card"><h3>Supabase Connection</h3>
   <label>Project URL<input id="cloudUrl" placeholder="https://YOUR-PROJECT.supabase.co"></label>
   <label>Anon / Publishable Key<input id="cloudKey" type="password" placeholder="Supabase anon/publishable key"></label>
   <div class="row"><button id="cloudSave" class="primary">Save Connection</button><button id="cloudClear" class="ghost">Clear</button></div>
   <p class="muted">Use only a public anon/publishable key. Never put a service-role secret in this browser app.</p>
  </article>
  <article class="card"><h3>Sync Controls</h3>
   <div class="row"><button id="cloudPush" class="secondary">Push Local → Cloud</button><button id="cloudPull" class="secondary">Pull Cloud → Local</button><button id="cloudBoth" class="primary">Sync Both Ways</button></div>
   <div id="cloudMeta" class="muted">No sync performed yet.</div>
   <div class="warning">Before using cloud sync, create the Phase 13 Supabase table and Row Level Security policies from <b>supabase/phase-13-cloud-sync.sql</b>. Authentication/roles are intentionally reserved for Phase 14.</div>
  </article>
 </div>
 <article class="card"><h3>Data Safety</h3><p class="muted">Cloud rows are keyed by Inspection ID. During two-way sync, the newer record timestamp wins for the same ID; unrelated records are preserved. This phase does not bypass PASS/REJECT/HOLD gates.</p></article>
 `;
 main.appendChild(s);
 b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.id==='cloudSync'));document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab==='cloudSync'));loadConfig();window.scrollTo(0,0)};
 document.getElementById('cloudSave').onclick=()=>{saveCfg({url:document.getElementById('cloudUrl').value.trim(),key:document.getElementById('cloudKey').value.trim()});setStatus('Connection saved locally. Ready to sync.',true)};
 document.getElementById('cloudClear').onclick=()=>{localStorage.removeItem(CONFIG_KEY);document.getElementById('cloudUrl').value='';document.getElementById('cloudKey').value='';setStatus('Connection cleared.')};
 document.getElementById('cloudPush').onclick=push;
 document.getElementById('cloudPull').onclick=pull;
 document.getElementById('cloudBoth').onclick=both;
 loadConfig();
}
function loadConfig(){const c=cfg();if(document.getElementById('cloudUrl'))document.getElementById('cloudUrl').value=c.url||'';if(document.getElementById('cloudKey'))document.getElementById('cloudKey').value=c.key||'';const s=state();if(s.message)setStatus(s.message)}
function valid(){const c=cfg();if(!c.url||!c.key){setStatus('Configure Supabase Project URL and anon/publishable key first.');return false}return true}
async function push(){
 if(!valid())return;
 try{
  const rows=getRecords().map(data=>({id:data.id,data,updated_at:data.updatedAt||data.audit?.updatedAt||data.savedAt||data.createdAt||new Date().toISOString()}));
  const r=await fetch(apiUrl(),{method:'POST',headers:headers(),body:JSON.stringify(rows)});
  if(!r.ok)throw new Error(await r.text());
  setStatus(rows.length+' local record(s) pushed to cloud.',true);
  document.getElementById('cloudMeta').textContent='Last push: '+new Date().toLocaleString();
 }catch(e){setStatus('Cloud push failed: '+e.message)}
}
async function pull(){
 if(!valid())return;
 try{
  const r=await fetch(apiUrl()+'?select=id,data,updated_at&order=updated_at.desc',{headers:headers()});
  if(!r.ok)throw new Error(await r.text());
  const cloud=normalize(await r.json()),merged=mergeLocalCloud(getRecords(),cloud);
  window.DKQualityInspection.replaceRecords(merged);
  setStatus(cloud.length+' cloud record(s) retrieved. Local history merged safely.',true);
  document.getElementById('cloudMeta').textContent='Last pull: '+new Date().toLocaleString();
 }catch(e){setStatus('Cloud pull failed: '+e.message)}
}
async function both(){
 await push();await pull();
}
window.addEventListener('DOMContentLoaded',render);
})();