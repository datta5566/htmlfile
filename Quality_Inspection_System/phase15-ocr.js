(()=>{'use strict';
const OCR_KEY='dk_quality_ocr_v1';
const state=()=>JSON.parse(localStorage.getItem(OCR_KEY)||'{}');
const save=x=>localStorage.setItem(OCR_KEY,JSON.stringify(x));
const setStatus=(m,ok=false)=>{const e=document.getElementById('ocrStatus');if(e){e.textContent=m;e.className='pill '+(ok?'ready':'')}};
function parse(text){
 const out=[], seen=new Set();
 const patterns=[
  {type:'DIMENSION',re:/([A-Za-z][A-Za-z0-9 _-]{2,50})\s*[:=]\s*(\d+(?:\.\d+)?)\s*(?:±\s*(\d+(?:\.\d+)?))?\s*(mm|cm|in)\b/gi},
  {type:'DIMENSION',re:/\b(?:LENGTH|WIDTH|HEIGHT|DEPTH|THICKNESS|DIAMETER)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:±\s*(\d+(?:\.\d+)?))?\s*(mm|cm|in)\b/gi},
  {type:'HOLE',re:/\b(?:HOLE|DIA|DIAMETER)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:±\s*(\d+(?:\.\d+))?)?\s*(mm|cm|in)\b/gi}
 ];
 patterns.forEach(p=>{let m;while((m=p.re.exec(text))){const name=(m[1]||p.type).trim();const nominal=Number(m[2]);const tol=Number(m[3]||0);const unit=m[4];const key=[name,nominal,tol,unit].join('|').toLowerCase();if(!seen.has(key)){seen.add(key);out.push({id:'OCR-'+(out.length+1),name,type:p.type,drawingRef:'OCR extracted',nominal,tol,actual:'',unit,critical:false,result:'HOLD',remark:'OCR candidate — drawing verification required.'})}}});
 return out;
}
async function run(){
 const file=document.getElementById('ocrFile')?.files?.[0];if(!file){setStatus('Select a PDF/image first.');return}
 const textArea=document.getElementById('drawingExtractedText');
 if(file.type==='application/pdf'){setStatus('PDF text extraction requires verified drawing text; OCR image mode is recommended.');return}
 if(!window.Tesseract){setStatus('OCR engine is not loaded.');return}
 setStatus('OCR processing…');
 try{
  const r=await Tesseract.recognize(file,'eng',{logger:m=>{if(m.status) setStatus('OCR: '+m.status+' '+Math.round((m.progress||0)*100)+'%')}});
  const text=r.data?.text||'';if(textArea)textArea.value=text;
  const candidates=parse(text);const x=window.DKQualityInspection?.getCurrent?.();
  if(candidates.length){setStatus(candidates.length+' candidate characteristic(s) found. Verify against drawing before building.',true);window.DKQualityInspection?.setOcrCandidates?.(candidates)}
  else setStatus('OCR completed, but no reliable structured dimensions were found. Manual Verification Required.');
 }catch(e){setStatus('OCR failed: '+e.message)}
}
function render(){
 if(document.getElementById('ocrTools'))return;
 const target=document.querySelector('#drawing .grid:nth-of-type(2)')||document.querySelector('#drawing .grid');
 if(!target)return;
 const card=document.createElement('article');card.className='card';card.id='ocrTools';card.innerHTML='<h3>Advanced OCR / Dimension Candidates</h3><p class="muted">OCR only proposes candidates. It never creates an automatic PASS from uncertain drawing text.</p><input id="ocrFile" type="file" accept="image/*"><div class="row"><button id="runOcr" class="secondary">Run OCR</button><button id="applyOcr" class="primary">Review Candidates</button><span id="ocrStatus" class="pill">Ready</span></div><div id="ocrCandidates" class="ocr-candidates"></div>';
 target.appendChild(card);
 document.getElementById('runOcr').onclick=run;
 document.getElementById('applyOcr').onclick=()=>{const x=window.DKQualityInspection?.getOcrCandidates?.()||[];document.getElementById('ocrCandidates').innerHTML=x.length?x.map(q=>'<div class="ocr-row"><b>'+q.name+'</b><span>'+q.nominal+' ± '+q.tol+' '+q.unit+'</span><em>VERIFY</em></div>').join(''):'No candidates. Manual entry required.'};
}
window.DKQualityInspection=window.DKQualityInspection||{};
window.DKQualityInspection.getOcrCandidates=()=>state().candidates||[];
window.DKQualityInspection.setOcrCandidates=x=>save({...state(),candidates:x});
window.addEventListener('DOMContentLoaded',render);
})();