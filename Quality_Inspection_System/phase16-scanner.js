(()=>{'use strict';
let stream=null,detector=null,running=false,last='';
const $=id=>document.getElementById(id);
function status(t,ok=false){const e=$('scannerStatus');if(e){e.textContent=t;e.className='pill '+(ok?'ready':'')}}
function parsePayload(raw){
 const s=String(raw||'').trim(); if(!s)return null;
 try{return JSON.parse(s)}catch(e){}
 try{return JSON.parse(decodeURIComponent(s))}catch(e){}
 return null;
}
function applyScan(raw){
 raw=String(raw||'').trim(); if(!raw)return;
 const payload=parsePayload(raw);
 if(payload?.inspectionId){
   window.DKQualityInspection?.handleScanResult?.(raw); return;
 }
 const barcode=payload?.barcode||raw;
 const inp=$('stickerRaw'); if(inp)inp.value=raw;
 const b=$('barcode'); if(b)b.value=barcode;
 if(window.DKQualityInspection?.setScannedBarcode)window.DKQualityInspection.setScannedBarcode(barcode,raw);
 stop();
 if(payload?.project||payload?.partNumber||payload?.drawing||payload?.revision){
   const project=$('project'),part=$('partNumber'),draw=$('drawingNumber'),rev=$('drawingRevision');
   if(project&&payload.project)project.value=payload.project;
   if(part&&payload.partNumber)part.value=payload.partNumber;
   if(draw&&payload.drawing)draw.value=payload.drawing;
   if(rev&&payload.revision)rev.value=payload.revision;
   $('partName')?.focus();
 }
 $('mismatch')?.classList.add('hidden');
 status('Scan captured — verify identity before continuing.',true);
}
async function start(){
 if(window.Android?.startNativeScanner){window.Android.startNativeScanner();return}
 if(!navigator.mediaDevices?.getUserMedia){status('Camera access is not supported in this browser.');return}
 const video=$('scannerVideo'),modal=$('phase16Scanner'); if(!video||!modal)return;
 modal.classList.remove('hidden'); last=''; running=true;
 try{
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
  video.srcObject=stream; await video.play();
  if('BarcodeDetector' in window){
   try{detector=new BarcodeDetector({formats:['qr_code','code_128','code_39','code_93','ean_13','ean_8','upc_a','upc_e','itf_14','data_matrix']});status('Scanning QR / Barcode…')}
   catch(e){detector=null;status('Camera active. Barcode detection unavailable; use Android scanner or manual entry.')}
  }else status('Camera active. Browser BarcodeDetector unavailable; use Android scanner or manual entry.');
  if(detector)loop();
 }catch(e){running=false;modal.classList.remove('hidden');status('Camera permission/error: '+e.message)}
}
async function loop(){
 if(!running||!detector)return;
 const video=$('scannerVideo');
 try{
  const codes=await detector.detect(video);
  if(codes?.length){const raw=codes[0].rawValue||'';if(raw&&raw!==last){last=raw;applyScan(raw);return}}
 }catch(e){status('Scanner read error — keep sticker inside frame.')}
 requestAnimationFrame(loop);
}
function stop(){
 running=false;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
 const v=$('scannerVideo');if(v)v.srcObject=null;
 $('phase16Scanner')?.classList.add('hidden');status('Camera stopped.');
}
function nativeResult(raw){applyScan(raw)}
function bind(){
 $('nativeScan')?.addEventListener('click',e=>{e.preventDefault();start()});
 $('traceabilityScan')?.addEventListener('click',e=>{e.preventDefault();start()});
 $('closeScanner')?.addEventListener('click',stop);$('stopScanner')?.addEventListener('click',stop);
 window.DKQualityInspection=window.DKQualityInspection||{};
 window.DKQualityInspection.handleCameraScan=nativeResult;
 window.DKQualityInspection.setScannedBarcode=(barcode,raw)=>{
   if(window.currentInspection)window.currentInspection.barcode=barcode;
   $('barcode')&&( $('barcode').value=barcode );
   if(raw&&raw!==barcode)$('stickerRaw').value=raw;
   $('identityGate')?.classList.add('ready');
 };
 window.onQualityInspectionCameraScan=nativeResult;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
