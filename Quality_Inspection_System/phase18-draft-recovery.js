(()=>{'use strict';
const KEY='dk_quality_inspection_draft_v1';
let timer=null;
const $=id=>document.getElementById(id);

function getDraft(){
  try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){return null}
}
function setStatus(text,ready=true){
  const el=$('draftState'); if(!el)return;
  el.textContent=text; el.className='pill '+(ready?'ready':'');
}
function refreshDraftControls(){
  const d=getDraft();
  const b=$('resumeDraft');
  if(b)b.classList.toggle('hidden',!d);
  if(d){
    const when=d.savedAt?new Date(d.savedAt).toLocaleString():'saved';
    setStatus('DRAFT • '+when,true);
  }else setStatus('NO DRAFT',false);
}
function saveDraft(reason='auto'){
  const api=window.DKQualityInspection;
  if(!api?.getCurrent)return;
  const current=api.getCurrent();
  if(!current)return;
  try{
    localStorage.setItem(KEY,JSON.stringify({version:1,savedAt:new Date().toISOString(),reason,inspection:current}));
    refreshDraftControls();
  }catch(e){
    setStatus('DRAFT STORAGE FULL',false);
  }
}
function queueSave(reason='auto'){
  clearTimeout(timer);
  timer=setTimeout(()=>saveDraft(reason),650);
}
function clearDraft(){
  localStorage.removeItem(KEY);
  refreshDraftControls();
}
function resumeDraft(){
  const d=getDraft();
  if(!d?.inspection)return;
  const api=window.DKQualityInspection;
  if(api?.setCurrent?.(d.inspection)){
    setStatus('DRAFT RESUMED',true);
    window.scrollTo(0,0);
  }
}
function addControls(){
  const actions=document.querySelector('.top-actions');
  if(!actions || $('draftState'))return;
  const state=document.createElement('span');
  state.id='draftState'; state.className='pill'; state.textContent='NO DRAFT';
  const resume=document.createElement('button');
  resume.id='resumeDraft'; resume.className='ghost hidden'; resume.textContent='Resume Draft';
  resume.onclick=resumeDraft;
  actions.insertBefore(state,actions.firstChild);
  actions.insertBefore(resume,actions.lastElementChild);
  refreshDraftControls();
}
document.addEventListener('DOMContentLoaded',()=>{
  addControls();
  const app=$('app');
  app?.addEventListener('input',()=>queueSave('input'),true);
  app?.addEventListener('change',()=>queueSave('change'),true);
  $('newInspection')?.addEventListener('click',()=>{clearDraft();setTimeout(refreshDraftControls,0)});
  window.addEventListener('beforeunload',()=>saveDraft('page-exit'));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveDraft('background')});
  addControls();
});
window.DKQualityInspection=window.DKQualityInspection||{};
window.DKQualityInspection.clearDraft=clearDraft;
window.DKQualityInspection.getDraft=()=>getDraft();
})();