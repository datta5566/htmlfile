(() => {
  "use strict";

  const config = window.DK_CLOUD_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const toolCode = params.get("tool") || "";
  const DEVICE_KEY = "DK_PUBLIC_TOOL_DEVICE_ID";
  const SYNC_PREFIX = "DK_PUBLIC_TOOL_SYNC_V1_";

  const TOOLS = Object.freeze({
    ua_uc: { name:"UA / UC / Near Miss", icon:"🛡️", note:"Safety Data Hub", url:"../ua-uc/", keys:["whatsapp-safety-saved-records-online-v1"] },
    kaizen: { name:"Kaizen Converter", icon:"💡", note:"Kaizen records and conversion", url:"../kaizen/", keys:["kaizen_converter_records_v8_combined_v2","dk_kaizen_online_records_v4"] },
    rejection: { name:"Rejection Management", icon:"📊", note:"Rejection, rework and quality records", url:"../Rejection_Management_System_V2_Ultra_Professional.html", keys:["rejection_records_v2","rejection_records"] },
    file_store: { name:"File Store Pro", icon:"📁", note:"KN-wise barcode and file records", url:"https://datta5566.github.io/cl-new-/", keys:["FILE_STORE_PRO_RECORDS_V2"] },
    complaint_trace: { name:"Customer Complaint", icon:"🔎", note:"Customer complaint traceability", url:"https://datta5566.github.io/cl-new-/#complaintPanel", keys:["FILE_STORE_PRO_COMPLAINTS_V1"] },
    pdi_scanner: { name:"DK PDI Scanner", icon:"📷", note:"PDI scan and report history", url:"../DK_PDI_Android/app/src/main/assets/index.html", keys:["dk_pdi_android_reports_v1"] }
  });

  const TRANSLATIONS = [
    ["Pehle Excel/CSV file choose karo.","Choose an Excel/CSV file first."],
    ["Internet ON karo, Excel engine load nahi hua.","Turn on the internet; the Excel engine did not load."],
    ["Excel file read ho rahi hai...","Reading the Excel file..."],
    ["Excel me header/data row nahi mili.","No header or data row was found in the Excel file."],
    ["Column names match nahi hue.","Column names did not match."],
    ["Check karke Save dabao.","Review the records and click Save."],
    ["File read hui, lekin data rows nahi mili.","The file was read, but no data rows were found."],
    ["Pehle WhatsApp messages ya Excel file ko preview me convert karo.","Convert WhatsApp messages or the Excel file to the preview first."],
    ["Main Excel file select karo.","Select the main Excel file."],
    ["Complaint se Unit Trace karo","Trace Unit from Customer Complaint"],
    ["Barcode trace result yaha dikhai dega.","The barcode trace result will appear here."],
    ["यहाँ","Here"],["केवल","Only"],["दिखेगा","will be shown"],["दिखाई देगा","will be shown"]
  ];

  const tool = TOOLS[toolCode];
  let syncBusy = false;
  let syncTimer = null;
  let delayedSync = null;
  let frameObserver = null;

  function setBadge(text, state = "") {
    const badge = $("#cloudBadge");
    badge.textContent = text;
    badge.classList.toggle("ok", state === "ok");
    badge.classList.toggle("err", state === "err");
  }

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      const raw = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      id = `public-${raw}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    if (!id.startsWith("public-")) id = `public-${id}`;
    return id;
  }

  async function sha256(text) {
    const bytes = new TextEncoder().encode(String(text));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2,"0")).join("");
  }

  function safeJson(raw) {
    if (raw == null || raw === "") return [];
    try { return JSON.parse(raw); } catch { return String(raw); }
  }

  function itemCount(payload) {
    if (Array.isArray(payload)) return payload.length;
    if (payload && typeof payload === "object") return 1;
    return String(payload ?? "").trim() ? 1 : 0;
  }

  function sanitize(value, depth = 0) {
    if (depth > 8) return "[nested data omitted]";
    if (Array.isArray(value)) return value.slice(0, 5000).map((v) => sanitize(v, depth + 1));
    if (value && typeof value === "object") {
      const out = {};
      for (const [key, val] of Object.entries(value)) {
        if (key === "fileData" || key === "imageData" || key === "photoData") {
          out[`${key}StoredLocally`] = true;
          continue;
        }
        out[key] = sanitize(val, depth + 1);
      }
      return out;
    }
    if (typeof value === "string" && value.startsWith("data:") && value.length > 3000) return "[file stored locally]";
    if (typeof value === "string" && value.length > 20000) return `${value.slice(0,20000)}…`;
    return value;
  }

  async function publicSync(storageKey, payload) {
    const endpoint = `${String(config.supabaseUrl || "").replace(/\/$/,"")}/functions/v1/public-tool-sync`;
    if (!endpoint.startsWith("https://")) throw new Error("Cloud configuration is unavailable");
    const body = {
      app_code: toolCode,
      device_id: getDeviceId(),
      storage_key: storageKey,
      source_url: new URL(tool.url, location.href).href,
      payload: sanitize(payload),
      item_count: itemCount(payload)
    };
    const response = await fetch(endpoint, {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "apikey":config.supabasePublishableKey || ""
      },
      body:JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Cloud sync failed (${response.status})`);
  }

  async function syncKey(storageKey, force = false) {
    const rawValue = localStorage.getItem(storageKey);
    const cacheKey = `${SYNC_PREFIX}${toolCode}_${storageKey}`;
    const hadPrevious = localStorage.getItem(cacheKey) !== null;
    if (rawValue === null && !hadPrevious) return false;
    const raw = rawValue ?? "[]";
    const fingerprint = await sha256(raw);
    if (!force && localStorage.getItem(cacheKey) === fingerprint) return false;
    await publicSync(storageKey, safeJson(raw));
    localStorage.setItem(cacheKey, fingerprint);
    return true;
  }

  async function syncAll(force = false) {
    if (!tool || syncBusy) return;
    syncBusy = true;
    setBadge(`Cloud: Saving ${tool.name}...`, "ok");
    try {
      let changed = 0;
      for (const key of tool.keys) if (await syncKey(key, force)) changed += 1;
      const time = new Date().toLocaleTimeString("en-IN", {hour:"2-digit",minute:"2-digit"});
      setBadge(changed ? `Cloud: Saved ${time}` : `Cloud: Up to date ${time}`, "ok");
    } catch (error) {
      setBadge(`Cloud: ${error.message || "Save failed"}`, "err");
    } finally {
      syncBusy = false;
    }
  }

  function scheduleSync(delay = 600) {
    clearTimeout(delayedSync);
    delayedSync = setTimeout(() => syncAll(false), delay);
  }

  function translateString(text) {
    let value = String(text ?? "");
    for (const [from,to] of TRANSLATIONS) value = value.split(from).join(to);
    return value;
  }

  function unlockAndTranslateFrame() {
    const frame = $("#toolFrame");
    let doc;
    try { doc = frame.contentDocument; } catch { return; }
    if (!doc?.body) return;

    const apply = () => {
      doc.body.classList.remove("lock","locked","login-mode","auth-required");
      doc.querySelectorAll("[placeholder],[title],[aria-label]").forEach((el) => {
        for (const attr of ["placeholder","title","aria-label"]) {
          if (!el.hasAttribute(attr)) continue;
          const oldValue = el.getAttribute(attr);
          const newValue = translateString(oldValue);
          if (newValue !== oldValue) el.setAttribute(attr,newValue);
        }
      });
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        if (node.parentElement?.matches("script,style,noscript,textarea,input,pre,code,[contenteditable='true']")) continue;
        const next = translateString(node.nodeValue);
        if (next !== node.nodeValue) node.nodeValue = next;
      }
    };

    apply();
    frameObserver?.disconnect();
    frameObserver = new MutationObserver(apply);
    frameObserver.observe(doc.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["class","placeholder","title","aria-label"]});
  }

  function openTool() {
    document.title = `${tool.name} — DK User Link`;
    $("#toolIcon").textContent = tool.icon;
    $("#toolName").textContent = tool.name;
    $("#toolNote").textContent = `${tool.note} · No password · Auto cloud sync`;
    $("#toolFrame").src = tool.url;
    setBadge("Cloud: Ready", "ok");
    clearInterval(syncTimer);
    syncTimer = setInterval(() => syncAll(false), Math.max(5000, Number(config.syncIntervalMs) || 15000));
    setTimeout(() => syncAll(false), 1200);
  }

  if (!tool) {
    $("#toolName").textContent = "Invalid Tool Link";
    $("#toolNote").textContent = "Return to All Tools and choose a valid office tool.";
    $("#loadingLayer").textContent = "Invalid tool link";
    setBadge("Cloud: Invalid link", "err");
    return;
  }

  $("#toolFrame").addEventListener("load", () => {
    $("#loadingLayer").hidden = true;
    unlockAndTranslateFrame();
    scheduleSync(800);
    try {
      const doc = $("#toolFrame").contentDocument;
      doc?.addEventListener("click", () => scheduleSync(900), true);
      doc?.addEventListener("input", () => scheduleSync(1200), true);
      doc?.addEventListener("change", () => scheduleSync(700), true);
    } catch {}
  });

  window.addEventListener("storage", (event) => { if (tool.keys.includes(event.key)) scheduleSync(250); });
  window.addEventListener("online", () => scheduleSync(100));
  document.addEventListener("visibilitychange", () => { if (document.hidden) syncAll(false); });

  openTool();
})();
