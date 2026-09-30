(()=>{'use strict';
const $=id=>document.getElementById(id),KEY='dk_quality_inspections_v1';
let records=JSON.parse(localStorage.getItem(KEY)||'[]'),current=null;let drawingObjectUrl='';
const processes=['Cutting','Punching','Milling','Welding','Grinding','Cleaning','Lacquering / Surface Treatment','Final Inspection'];
const visual=['Cutting size/straightness/burr','All required punching holes and positions','Milling complete, size and surface acceptable','Welding complete, position, porosity/crack/lump','Grinding complete, sharp edges removed','Stiffener type/position/quantity/gap/welding','End Cap / Rail / other components','Final visual inspection and sticker readability'];
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function fresh(){return{id:'INS-'+Date.now().toString(36).toUpperCase(),createdAt:new Date().toISOString(),inspector:$('inspector')?.value||localStorage.getItem('dk_inspector')||'',part:{},drawing:{fileName:'',manual:false,checks:[],status:'NOT UPLOADED',fileType:'',fileSize:0,project:'',partNumber:'',drawingNumber:'',revision:'',extraction:'NOT ATTEMPTED',extractedText:'',notes:''},measurement:{instrument:'',calibrationNo:'',method:'',remark:''},approval:{reportNo:'',inspectionDate:'',qualityEngineer:'',decision:'HOLD',remark:'',approvedAt:''},audit:{createdAt:new Date().toISOString(),createdBy:'',updatedAt:'',updatedBy:'',revision:1},auditLog:[],traceability:{qrPayload:'',generatedAt:''},dimensions:[],processes:Object.fromEntries(processes.map(x=>[x,{status:'NOT COMPLETED',operator:'',date:'',machine:'',batch:'',remark:''}])),visual:Object.fromEntries(visual.map(x=>[x,{status:'HOLD',inspector:'',date:'',remark:''}])),photos:[],defects:[],result:'HOLD',remark:''}}
function saveLocal(){localStorage.setItem(KEY,JSON.stringify(records));$('saveState').textContent='SAVED LOCALLY'}
function auditEvent(action,detail=''){if(!current)return;current.auditLog=Array.isArray(current.auditLog)?current.auditLog:[];current.auditLog.push({id:'AUD-'+Date.now().toString(36).toUpperCase(),at:new Date().toISOString(),by:localStorage.getItem('dk_inspector')||current.inspector||'System',action,detail});if(current.auditLog.length>200)current.auditLog=current.auditLog.slice(-200)}
function renderAuditTimeline(){const el=$('auditTimeline');if(!el)return;const list=(current?.auditLog||[]).slice().reverse();el.innerHTML=list.map(x=>'<div class="audit-event"><div class="audit-dot"></div><div><b>'+esc(x.action)+'</b><small>'+esc(new Date(x.at).toLocaleString())+' • '+esc(x.by||'System')+'</small><p>'+esc(x.detail||'')+'</p></div></div>').join('')||'<div class="muted">No audit events recorded yet.</div>';if($('auditCount'))$('auditCount').textContent=list.length+' events'}
function nav(id){if(current&&id!==document.querySelector('.tab.active')?.id)auditEvent('SECTION_OPENED',id);document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.id===id));document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));if(id==='review')renderReview();if(id==='history')renderHistory();if(id==='report'){renderProfessionalReport();generateTraceabilityQR()}if(id==='traceability')renderTraceabilityResult();if(id==='audit')renderAuditTimeline();if(id==='backup'){$('backupStatus').textContent='Ready to restore a JSON backup.';}window.scrollTo(0,0)}
function init(){
 ['project','partNumber','partName','barcode','drawingNumber','drawingRevision'].forEach(k=>$(k)?.addEventListener('input',updateIdentityGate));
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>nav(b.dataset.tab));
 document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>nav(b.dataset.go));
 $('loginBtn').onclick=()=>{const n=$('loginName').value.trim();if(!n)return alert('Inspector name required');localStorage.setItem('dk_inspector',n);$('login').classList.add('hidden');$('app').classList.remove('hidden');startNew()};
 $('newInspection').onclick=startNew;
 $('parseSticker').onclick=parseSticker;
 $('nativeScan').onclick=()=>{if(window.Android?.startNativeScanner)window.Android.startNativeScanner();else alert('Android scanner bridge available only in the Android build. Use manual sticker data here.')};
 $('drawingFile').onchange=loadDrawing;
 ['drawingProject','drawingPartNumber','drawingDrawingNumber','drawingRevision','drawingNotes','drawingExtractedText'].forEach(k=>$(k)?.addEventListener('input',syncDrawingFields));
 $('extractDrawing').onclick=extractDrawingText;$('clearDrawing').onclick=clearDrawing;$('buildCharacteristics').onclick=buildCharacteristicsFromVerifiedText;$('addCharacteristic').onclick=addDimension;
 ['measurementInstrument','calibrationNo','measurementMethod','measurementRemark'].forEach(k=>$(k)?.addEventListener('input',syncMeasurementMeta));
 $('markDrawingHold').onclick=()=>{current.drawing.manual=true;renderDrawingChecks()};
 $('addDefect').onclick=addDefect;$('photoFile').onchange=addPhoto;$('saveInspection').onclick=saveInspection;
 const printReport=()=>{nav('report');setTimeout(()=>window.print(),50)};
 $('printReport').onclick=printReport;
 $('reportRefresh')?.addEventListener('click',()=>{renderProfessionalReport();generateTraceabilityQR()});
 $('generateQr')?.addEventListener('click',generateTraceabilityQR);
 $('reportPrint')?.addEventListener('click',printReport);
 ['reportNo','inspectionDate','qualityEngineer','approvalDecision','approvalRemark'].forEach(k=>$(k)?.addEventListener('input',syncApproval));
 $('exportJson').onclick=exportJson;$('importJson').onchange=importJsonBackup;
 ['historySearch','historyStatus','historyUnit','historyInspector','historyFrom','historyTo'].forEach(id=>$(id)?.addEventListener('input',renderHistory));
 $('clearHistoryFilters')?.addEventListener('click',clearHistoryFilters);$('exportCsv')?.addEventListener('click',exportHistoryCsv);
 renderDashboard();renderHistory();renderProfessionalReport();generateTraceabilityQR();
 $('traceabilityScan')?.addEventListener('click',startTraceabilityScan);
 $('traceabilityLookup')?.addEventListener('click',()=>renderTraceabilityResult());
 $('traceabilityInput')?.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')renderTraceabilityResult()});
}
function validateBackupRecords(data){if(!Array.isArray(data))return{ok:false,records:[],message:'Backup must contain an inspection record array.'};const clean=data.filter(x=>x&&typeof x==='object'&&typeof x.id==='string');if(!clean.length)return{ok:false,records:[],message:'No valid inspection records found in backup.'};const ids=new Set();const unique=clean.filter(x=>{if(ids.has(x.id))return false;ids.add(x.id);return true});return{ok:true,records:unique,message:unique.length+' valid inspection record(s) found.'}}
function importJsonBackup(e){const f=e.target.files?.[0];if(!f)return;const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);const v=validateBackupRecords(data);if(!v.ok){alert(v.message);return}const existing=new Map(records.map(x=>[x.id,x]));v.records.forEach(x=>existing.set(x.id,x));records=Array.from(existing.values());saveLocal();renderDashboard();renderHistory();renderProfessionalReport();if($('backupStatus'))$('backupStatus').textContent=v.records.length+' record(s) restored/updated successfully.';alert(v.message+' Local history updated.')}catch(err){if($('backupStatus'))$('backupStatus').textContent='Invalid JSON backup.';alert('Invalid JSON backup file.')}};reader.readAsText(f);e.target.value=''}

function reportText(v){return esc(v==null||v===''?'—':String(v))}
function buildTraceabilityPayload(){const p=current?.part||{},d=current?.drawing||{};return JSON.stringify({inspectionId:current?.id||'',project:p.project||'',partNumber:p.partNumber||'',barcode:p.barcode||'',drawing:d.drawingNumber||'',revision:d.revision||''})}function generateTraceabilityQR(){if(!current)return;const box=$('inspectionQr');if(!box)return;box.innerHTML='';const payload=buildTraceabilityPayload();current.traceability=current.traceability||{};current.traceability.qrPayload=payload;current.traceability.generatedAt=new Date().toISOString();if(window.QRCode)new QRCode(box,{text:payload,width:180,height:180});else box.textContent='QR library unavailable. Payload: '+payload;if($('qrPayload'))$('qrPayload').value=payload}function renderProfessionalReport(){
 const x=current;if(!x)return;const a=x.approval||{},p=x.part||{},d=x.drawing||{};
 const set=(id,v)=>{if($(id))$(id).textContent=v};
 set('rReportNo','Report No: '+(a.reportNo||x.id||'—'));if($('qrPayload'))$('qrPayload').value=x.traceability?.qrPayload||buildTraceabilityPayload();set('rInspectionId',x.id);set('rDate',a.inspectionDate);set('rProject',p.project);set('rUnit',p.unit);set('rPart',p.partNumber);set('rPartName',p.partName);set('rDrawing',d.drawingNumber);set('rRevision',d.revision);set('rBarcode',p.barcode);set('rInspector',x.inspector);
 const status=x.result||finalStatus();const decision=a.decision||status;set('rDecision',decision);$('rDecision').className='report-status '+String(decision).toLowerCase();
 const pass=(x.dimensions||[]).filter(q=>dimResult(q)==='PASS').length,reject=(x.dimensions||[]).filter(q=>dimResult(q)==='REJECT').length,hold=(x.dimensions||[]).filter(q=>dimResult(q)==='HOLD').length,open=(x.defects||[]).filter(q=>q.status==='OPEN').length;
 $('rSummary').innerHTML='<div><b>System Result</b><span>'+reportText(status)+'</span></div><div><b>Dimensions</b><span>'+pass+' PASS / '+reject+' REJECT / '+hold+' HOLD</span></div><div><b>Open Defects</b><span>'+open+'</span></div><div><b>Process Count</b><span>'+processes.length+'</span></div>';
 $('rDimensions').innerHTML=(x.dimensions||[]).map(q=>{const z=measurementRange(q);return '<tr><td>'+reportText(q.name)+'</td><td>'+reportText(q.nominal)+'</td><td>± '+reportText(q.tol)+'</td><td>'+reportText(z.low)+'</td><td>'+reportText(z.high)+'</td><td>'+reportText(q.actual)+'</td><td>'+reportText(q.unit)+'</td><td>'+reportText(dimResult(q))+'</td></tr>'}).join('')||'<tr><td colspan="8">No characteristics recorded.</td></tr>';
 $('rProcesses').innerHTML=processes.map(name=>{const q=processRecord(name);return '<tr><td>'+reportText(name)+'</td><td>'+reportText(q.status)+'</td><td>'+reportText(q.operator)+'</td><td>'+reportText(q.date)+'</td><td>'+reportText(q.machine)+'</td><td>'+reportText(q.batch)+'</td><td>'+reportText(q.remark)+'</td></tr>'}).join('');
 $('rVisual').innerHTML=visual.map(name=>{const q=visualRecord(name);return '<div class="report-line"><b>'+reportText(name)+'</b><span>'+reportText(q.status)+'</span><small>'+reportText(q.inspector)+' • '+reportText(q.date)+' • '+reportText(q.remark)+'</small></div>'}).join('')||'<div class="muted">No visual records.</div>';
 $('rDefects').innerHTML=(x.defects||[]).map(q=>'<div class="report-line"><b>'+reportText(q.id)+' • '+reportText(q.type||'Defect')+'</b><span>'+reportText(q.status)+'</span><small>Reported by '+reportText(q.reportedBy)+' • '+reportText(q.reportedAt)+' • Rework: '+reportText(q.rework?.status)+' • '+reportText(q.rework?.action)+' • '+reportText(q.rework?.by)+' • '+reportText(q.rework?.date)+'</small></div>').join('')||'<div class="muted">No defects recorded.</div>';
 set('rSystemResult',status);set('rEngineer',a.qualityEngineer);set('rApprovedAt',a.approvedAt?new Date(a.approvedAt).toLocaleString():'—');set('rRemark',a.remark||x.remark);set('rAuditCreated',x.audit?.createdAt?new Date(x.audit.createdAt).toLocaleString():'—');set('rAuditUpdated',x.audit?.updatedAt?new Date(x.audit.updatedAt).toLocaleString():'—');set('rAuditBy',x.audit?.updatedBy||x.audit?.createdBy||'—');if($('rEvidence'))$('rEvidence').innerHTML=(x.photos||[]).map(q=>'<div class="report-evidence"><div><b>'+reportText(q.id)+'</b> • '+reportText(q.category)+'</div><small>'+reportText(q.name)+' • '+reportText(q.inspector)+' • '+reportText(q.addedAt)+'</small><img src="'+q.data+'"></div>').join('')||'<div class="muted">No photo evidence recorded.</div>';
}


window.DKQualityInspection = window.DKQualityInspection || {};
window.DKQualityInspection.setScannedBarcode = (barcode, raw='') => {
  if(!current) return false;
  current.part=current.part||{};
  current.part.barcode=String(barcode||'').trim();auditEvent('BARCODE_SCANNED','Barcode: '+current.part.barcode);
  if(raw && $('stickerRaw')) $('stickerRaw').value=raw;
  if($('barcode')) $('barcode').value=current.part.barcode;
  updateIdentityGate();
  renderReview();
  return true;
};
window.DKQualityInspection.getCurrent = () => current ? JSON.parse(JSON.stringify(current)) : null;
window.DKQualityInspection.addAuditEvent = (action,detail='') => { auditEvent(String(action||'ACTION'),String(detail||'')); renderAuditTimeline(); return true; };
window.DKQualityInspection.setCurrent = (next) => { if(!next || typeof next!=='object' || !next.id) return false; current=JSON.parse(JSON.stringify(next)); auditEvent('DRAFT_OR_RECORD_RESUMED','Inspection restored into current workspace'); fillIdentify(); renderAll(); nav('identify'); return true; };
window.DKQualityInspection.getRecords = () => JSON.parse(JSON.stringify(records));
window.DKQualityInspection.replaceRecords = (next) => {
  if(!Array.isArray(next)) return false;
  records = next.filter(x=>x && typeof x==='object' && typeof x.id==='string');
  saveLocal();
  renderDashboard();
  renderHistory();
  renderProfessionalReport();
  if(current) renderAll();
  return true;
};
window.DKQualityInspection.refreshCloudViews = () => { renderDashboard(); renderHistory(); renderProfessionalReport(); };
init();})();