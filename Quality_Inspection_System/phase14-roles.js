(()=>{'use strict';
const ROLE_KEY='dk_quality_role_v1';
const ROLES={
  INSPECTOR:{label:'Inspector',permissions:['create','edit','measure','process','visual','evidence','backup','report','traceability']},
  QUALITY_ENGINEER:{label:'Quality Engineer',permissions:['create','edit','measure','process','visual','evidence','backup','report','traceability','approve']},
  ADMIN:{label:'Admin',permissions:['create','edit','measure','process','visual','evidence','backup','report','traceability','approve','cloud','roles']}
};
const role=()=>localStorage.getItem(ROLE_KEY)||'INSPECTOR';
const setRole=r=>localStorage.setItem(ROLE_KEY,ROLES[r]?r:'INSPECTOR');
const can=p=>ROLES[role()]?.permissions.includes(p);
const badge=()=>document.getElementById('roleBadge');
function updateUI(){
 const r=role(),b=badge();if(b){b.textContent='ROLE: '+ROLES[r].label;b.className='role-badge '+r.toLowerCase()}
 document.querySelectorAll('[data-role-permission]').forEach(el=>{
   const ok=can(el.dataset.rolePermission);el.disabled=!ok;el.classList.toggle('role-locked',!ok);
   el.title=ok?'':('Permission required: '+ROLES[({approve:'Quality Engineer',cloud:'Admin',roles:'Admin'}[el.dataset.rolePermission]||'assigned role')]);
 });
 const cloud=document.querySelector('[data-tab="cloudSync"]');if(cloud)cloud.style.display=can('cloud')?'':'none';
 const roleTab=document.querySelector('[data-tab="roles"]');if(roleTab)roleTab.style.display=can('roles')?'':'none';
}
function render(){
 if(document.getElementById('roles'))return;
 const nav=document.querySelector('.tabs'),main=document.querySelector('main');if(!nav||!main)return;
 const rb=document.createElement('span');rb.id='roleBadge';rb.className='role-badge';document.querySelector('.top-actions')?.prepend(rb);
 const b=document.createElement('button');b.dataset.tab='roles';b.textContent='Roles';b.style.display=can('roles')?'':'none';nav.appendChild(b);
 const s=document.createElement('section');s.id='roles';s.className='tab';s.innerHTML=`
 <div class="section-head"><div><h2>User Roles & Permissions</h2><p>Phase 14 — role-based workflow control for the same Quality Inspection System.</p></div><span class="pill">Local role foundation</span></div>
 <div class="grid">
  <article class="card"><h3>Current User Role</h3><label>Role<select id="roleSelect"><option value="INSPECTOR">Inspector</option><option value="QUALITY_ENGINEER">Quality Engineer</option><option value="ADMIN">Admin</option></select></label><button id="saveRole" class="primary">Apply Role</button><p class="warning">Browser-local role selection is a workflow control, not secure authentication. Phase 14 prepares permissions; server-enforced identity will be added when authenticated cloud access is implemented.</p></article>
  <article class="card"><h3>Permission Matrix</h3><div id="permissionMatrix"></div></article>
 </div>
 <article class="card"><h3>Workflow Rules</h3><div class="checklist">
  <div class="check-item"><span>Inspector</span><b>Inspection execution & evidence</b></div>
  <div class="check-item"><span>Quality Engineer</span><b>Inspector permissions + final approval</b></div>
  <div class="check-item"><span>Admin</span><b>All workflow controls + role/cloud configuration</b></div>
 </div></article>`;
 main.appendChild(s);
 document.getElementById('roleSelect').value=role();
 document.getElementById('saveRole').onclick=()=>{setRole(document.getElementById('roleSelect').value);updateUI();renderMatrix();alert('Role applied: '+ROLES[role()].label)};
 renderMatrix();
 b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.id==='roles'));document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab==='roles'));window.scrollTo(0,0)};
}
function renderMatrix(){
 const el=document.getElementById('permissionMatrix');if(!el)return;
 const ps=['create','edit','measure','process','visual','evidence','backup','report','traceability','approve','cloud','roles'];
 el.innerHTML='<div class="permission-grid"><div><b>Permission</b></div><div><b>Inspector</b></div><div><b>Quality Engineer</b></div><div><b>Admin</b></div>'+
 ps.map(p=>'<div>'+p+'</div><div>'+(ROLES.INSPECTOR.permissions.includes(p)?'✓':'—')+'</div><div>'+(ROLES.QUALITY_ENGINEER.permissions.includes(p)?'✓':'—')+'</div><div>'+(ROLES.ADMIN.permissions.includes(p)?'✓':'—')+'</div>').join('')+'</div>';
}
function patchApproval(){
 const btn=document.getElementById('saveInspection');if(!btn||btn.dataset.rolePatched)return;
 btn.dataset.rolePatched='1';const original=btn.onclick;
 btn.onclick=function(e){
   if(!can('approve')){alert('Quality Engineer permission required for final approval. Inspector can complete inspection evidence but cannot save the final approval.');return}
   return original?.call(this,e);
 };
}
function protectApprovalFields(){
 ['qualityEngineer','approvalDecision','approvalRemark','reportNo','inspectionDate'].forEach(id=>{
  const el=document.getElementById(id);if(el){el.dataset.rolePermission='approve';el.disabled=!can('approve');}
 });
}
window.DKQualityInspectionRoles={roles:ROLES,getRole:role,setRole,can,updateUI};
window.addEventListener('DOMContentLoaded',()=>{render();updateUI();patchApproval();protectApprovalFields()});
})();