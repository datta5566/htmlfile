(()=>{'use strict';
let deferredPrompt=null;
function setNetwork(){const e=document.getElementById('networkState');if(!e)return;const online=navigator.onLine;e.textContent=online?'ONLINE':'OFFLINE';e.className='pill '+(online?'ready':'');}
window.addEventListener('online',setNetwork);window.addEventListener('offline',setNetwork);
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;const b=document.getElementById('installApp');if(b)b.classList.remove('hidden')});
window.addEventListener('appinstalled',()=>{deferredPrompt=null;document.getElementById('installApp')?.classList.add('hidden')});
document.addEventListener('DOMContentLoaded',()=>{
 setNetwork();
 const b=document.getElementById('installApp');
 b?.addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;b.classList.add('hidden')});
 if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
});
})();