/* Phase 21 — PDF Drawing Page Rendering & OCR Assist
   Controlled assist only: extracted values remain candidates and require human verification. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  let pdfDoc=null,currentFile=null;

  function setStatus(msg,kind){
    const el=$('pdfOcrStatus'); if(!el)return;
    el.textContent=msg; el.className='pill '+(kind||'');
  }
  function ensureCanvas(){
    const wrap=$('pdfOcrCanvasWrap'); if(!wrap)return null;
    let c=$('pdfOcrCanvas');
    if(!c){c=document.createElement('canvas');c.id='pdfOcrCanvas';c.className='drawing-page-canvas';wrap.innerHTML='';wrap.appendChild(c);}
    return c;
  }
  async function loadPdf(file){
    if(!window.pdfjsLib){setStatus('PDF engine unavailable — manual verification required','hold');return;}
    currentFile=file;
    try{
      setStatus('Loading PDF…');
      const data=await file.arrayBuffer();
      pdfDoc=await pdfjsLib.getDocument({data}).promise;
      const sel=$('pdfOcrPage');
      if(sel){
        sel.innerHTML='';
        for(let i=1;i<=pdfDoc.numPages;i++){const o=document.createElement('option');o.value=i;o.textContent='Page '+i;sel.appendChild(o);}
        sel.disabled=pdfDoc.numPages<2;
      }
      await renderPage(1);
      setStatus('PDF loaded — select a page and run OCR','ok');
    }catch(e){
      pdfDoc=null; setStatus('PDF could not be rendered — Manual Verification Required','hold');
    }
  }
  async function renderPage(pageNo){
    if(!pdfDoc)return;
    try{
      const page=await pdfDoc.getPage(Number(pageNo)||1);
      const viewport=page.getViewport({scale:1.6});
      const canvas=ensureCanvas(); if(!canvas)return;
      const ctx=canvas.getContext('2d',{alpha:false});
      canvas.width=viewport.width; canvas.height=viewport.height;
      await page.render({canvasContext:ctx,viewport}).promise;
      setStatus('Page '+pageNo+' rendered — verify against original drawing','ok');
    }catch(e){setStatus('Page render failed — Manual Verification Required','hold');}
  }
  async function runOcr(){
    const canvas=$('pdfOcrCanvas');
    if(!canvas||!canvas.width){setStatus('Render a drawing page first','hold');return;}
    if(!window.Tesseract){setStatus('OCR engine unavailable — Manual Verification Required','hold');return;}
    try{
      setStatus('OCR running…');
      const result=await Tesseract.recognize(canvas,'eng',{logger:m=>{
        if(m.status&&typeof m.progress==='number')setStatus('OCR: '+m.status+' '+Math.round(m.progress*100)+'%');
      }});
      const text=String(result?.data?.text||'').trim();
      if(!text){setStatus('No reliable text found — Manual Verification Required','hold');return;}
      const box=$('drawingExtractedText');
      if(box){
        const old=box.value.trim();
        box.value=old?old+'\n\n[PDF OCR — Page '+($('pdfOcrPage')?.value||'1')+']\n'+text:'[PDF OCR — Page '+($('pdfOcrPage')?.value||'1')+']\n'+text;
        box.dispatchEvent(new Event('input',{bubbles:true}));
      }
      if($('pdfOcrOutput'))$('pdfOcrOutput').textContent=text;
      setStatus('OCR complete — VERIFY all dimensions/tolerances before Build Characteristics','ok');
      window.DKQualityInspection?.addAuditEvent?.('DRAWING_PDF_OCR','PDF page '+($('pdfOcrPage')?.value||'1')+' OCR completed; values require verification.');
    }catch(e){setStatus('OCR failed — Manual Verification Required','hold');}
  }
  function handleFile(){
    const f=$('drawingFile')?.files?.[0];
    if(!f)return;
    if(f.type==='application/pdf'||/\.pdf$/i.test(f.name))loadPdf(f);
    else {pdfDoc=null;setStatus('Image drawing — use existing image OCR / manual verification','ok');}
  }
  function init(){
    const file=$('drawingFile');
    if(file)file.addEventListener('change',handleFile);
    $('pdfOcrPage')?.addEventListener('change',e=>renderPage(e.target.value));
    $('pdfOcrRun')?.addEventListener('click',runOcr);
    $('pdfOcrRender')?.addEventListener('click',()=>renderPage($('pdfOcrPage')?.value||1));
    window.DKQualityInspection=window.DKQualityInspection||{};
    window.DKQualityInspection.getPdfDrawingState=()=>({fileName:currentFile?.name||'',pages:pdfDoc?.numPages||0});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();