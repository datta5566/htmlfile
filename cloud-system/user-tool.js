(() => {
  "use strict";

  const config = window.DK_CLOUD_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const toolCode = params.get("tool") || "";
  const DEVICE_KEY = "DK_USER_CLOUD_DEVICE_ID";
  const SYNC_PREFIX = "DK_USER_DIRECT_SYNC_V1_";

  const TOOLS = Object.freeze({
    ua_uc: {
      name: "UA / UC / Near Miss",
      icon: "🛡️",
      note: "Safety Data Hub",
      url: "../ua-uc/",
      keys: ["whatsapp-safety-saved-records-online-v1"]
    },
    kaizen: {
      name: "Kaizen Converter",
      icon: "💡",
      note: "Kaizen records and conversion",
      url: "../kaizen/",
      keys: ["kaizen_converter_records_v8_combined_v2", "dk_kaizen_online_records_v4"]
    },
    rejection: {
      name: "Rejection Management",
      icon: "📊",
      note: "Rejection, rework and quality records",
      url: "../Rejection_Management_System_V2_Ultra_Professional.html",
      keys: ["rejection_records_v2", "rejection_records"]
    },
    file_store: {
      name: "File Store Pro",
      icon: "📁",
      note: "KN-wise barcode and file records",
      url: "https://datta5566.github.io/cl-new-/",
      keys: ["FILE_STORE_PRO_RECORDS_V2"]
    },
    complaint_trace: {
      name: "Customer Complaint",
      icon: "🔎",
      note: "Customer complaint traceability",
      url: "https://datta5566.github.io/cl-new-/#complaintPanel",
      keys: ["FILE_STORE_PRO_COMPLAINTS_V1"]
    },
    pdi_scanner: {
      name: "DK PDI Scanner",
      icon: "📷",
      note: "PDI scan and report history",
      url: "../DK_PDI_Android/app/src/main/assets/index.html",
      keys: ["dk_pdi_android_reports_v1"]
    }
  });

  const ENGLISH_REPLACEMENTS = [
    ["Pehle Excel/CSV file choose karo.", "Choose an Excel/CSV file first."],
    ["Internet ON karo, Excel engine load nahi hua.", "Turn on the internet; the Excel engine did not load."],
    ["Excel file read ho rahi hai...", "Reading the Excel file..."],
    ["Excel me header/data row nahi mili.", "No header or data row was found in the Excel file."],
    ["Column names match nahi hue.", "Column names did not match."],
    ["Check karke Save dabao.", "Review the records and click Save."],
    ["File read hui, lekin data rows nahi mili.", "The file was read, but no data rows were found."],
    ["Message convert ya Excel import karne ke baad Save dabao.", "Convert a message or import an Excel file before clicking Save."],
    ["Pehle WhatsApp messages ya Excel file ko preview me convert karo.", "Convert WhatsApp messages or the Excel file to the preview first."],
    ["Main Excel file select karo.", "Select the main Excel file."],
    ["File Microsoft Excel me open ho to pehle close kar do.", "Close the file in Microsoft Excel before continuing."],
    ["Main Excel file selection cancel hui.", "Main Excel file selection was cancelled."],
    ["Main Excel connection cancel hui.", "Main Excel connection was cancelled."],
    ["Pehle Connect Main Excel — One Time button se file connect karo.", "Connect the main Excel file first using Connect Main Excel — One Time."],
    ["Pehle messages convert karke preview me records lao.", "Convert the messages first so the records appear in the preview."],
    ["Excel file open ho to close karke retry karo.", "If the Excel file is open, close it and try again."],
    ["Camera off. File / batch name type karke Start Camera dabao.", "Camera is off. Enter the file / batch name and click Start Camera."],
    ["Website ready. File / batch name type karke camera start karo.", "Website ready. Enter the file / batch name and start the camera."],
    ["Complaint se Unit Trace karo", "Trace Unit from Customer Complaint"],
    ["Barcode trace result yaha dikhai dega.", "The barcode trace result will appear here."],
    ["Ab Save Directly button isi file ko update karega.", "The Save Directly button will now update this file."],
    ["Save करते समय permission allow करें.", "Allow permission when saving."],
    ["यहाँ", "Here"], ["केवल", "Only"], ["दिखेगा", "will be shown"], ["दिखाई देगा", "will be shown"]
  ];

  const tool = TOOLS[toolCode];
  let db = null;
  let user = null;
  let syncBusy = false;
  let syncTimer = null;
  let delayedSync = null;
  let frameObserver = null;

  function setMessage(text) { $("#loginMessage").textContent = text || ""; }
  function setBadge(text, ok = false) {
    $("#cloudBadge").textContent = text;
    $("#cloudBadge").classList.toggle("ok", ok);
  }

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  async function sha256(text) {
    const bytes = new TextEncoder().encode(String(text));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

  function cleanFileName(value) {
    return String(value || "uploaded-file").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120);
  }

  async function uploadDataUrl(dataUrl, record, storageKey) {
    const signature = await sha256(`${dataUrl.length}:${dataUrl.slice(0, 180)}`);
    const cacheKey = `DK_USER_CLOUD_FILE_${user.id}_${signature}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached;

    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const recordId = cleanFileName(record.id || record.barcode || record["Part Barcode"] || signature.slice(0, 16));
    const fileName = cleanFileName(record.fileName || record.name || `file-${signature.slice(0, 12)}`);
    const path = `${user.id}/${toolCode}/${getDeviceId()}/${cleanFileName(storageKey)}/${recordId}/${fileName}`;
    const { error } = await db.storage.from(config.storageBucket || "dk-app-files").upload(path, blob, {
      upsert: true,
      contentType: record.fileType || blob.type || "application/octet-stream"
    });
    if (error) throw error;
    localStorage.setItem(cacheKey, path);
    return path;
  }

  async function prepareRecord(record, storageKey) {
    if (!record || typeof record !== "object" || Array.isArray(record)) return record;
    const copy = { ...record };
    if (typeof copy.fileData === "string" && copy.fileData.startsWith("data:")) {
      try {
        copy.cloudFilePath = await uploadDataUrl(copy.fileData, copy, storageKey);
        copy.cloudFileName = copy.fileName || copy.name || "uploaded-file";
        copy.cloudFileType = copy.fileType || "application/octet-stream";
      } catch (error) {
        copy.cloudFileUploadError = error.message || "File upload failed";
      }
      delete copy.fileData;
    }
    return copy;
  }

  async function preparePayload(payload, storageKey) {
    if (Array.isArray(payload)) {
      const out = [];
      for (const record of payload) out.push(await prepareRecord(record, storageKey));
      return out;
    }
    return prepareRecord(payload, storageKey);
  }

  async function syncKey(storageKey, force = false) {
    if (!user) return false;
    const rawValue = localStorage.getItem(storageKey);
    const cacheKey = `${SYNC_PREFIX}${user.id}_${toolCode}_${storageKey}`;
    const hadPreviousSync = localStorage.getItem(cacheKey) !== null;
    if (rawValue === null && !hadPreviousSync) return false;

    const raw = rawValue ?? "[]";
    const fingerprint = await sha256(raw);
    if (!force && localStorage.getItem(cacheKey) === fingerprint) return false;

    const originalPayload = safeJson(raw);
    const cloudPayload = await preparePayload(originalPayload, storageKey);
    const { error } = await db.from("app_snapshots").upsert({
      user_id: user.id,
      app_code: toolCode,
      device_id: getDeviceId(),
      storage_key: storageKey,
      source_url: new URL(tool.url, location.href).href,
      payload: cloudPayload,
      item_count: itemCount(originalPayload),
      client_updated_at: new Date().toISOString()
    }, { onConflict: "user_id,app_code,device_id,storage_key" });
    if (error) throw error;
    localStorage.setItem(cacheKey, fingerprint);
    return true;
  }

  async function syncAll(force = false) {
    if (!user || syncBusy || !tool) return;
    syncBusy = true;
    setBadge(`Cloud: Saving ${tool.name}...`, true);
    try {
      let changed = 0;
      for (const key of tool.keys) if (await syncKey(key, force)) changed += 1;
      const time = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      setBadge(changed ? `Cloud: Saved ${time}` : `Cloud: Up to date ${time}`, true);
    } catch (error) {
      setBadge(`Cloud error: ${error.message || "Save failed"}`, false);
    } finally {
      syncBusy = false;
    }
  }

  function scheduleSync(delay = 500) {
    clearTimeout(delayedSync);
    delayedSync = setTimeout(() => syncAll(false), delay);
  }

  function translateText(text) {
    let out = String(text || "");
    for (const [from, to] of ENGLISH_REPLACEMENTS) out = out.split(from).join(to);
    return out;
  }

  function translateFrame() {
    const frame = $("#toolFrame");
    let doc;
    try { doc = frame.contentDocument; } catch { return; }
    if (!doc?.body) return;

    const translateNode = (node) => {
      if (node.nodeType !== Node.TEXT_NODE) return;
      const parent = node.parentElement;
      if (!parent || parent.closest("script,style,textarea,input,pre,code,td[contenteditable='true'],[contenteditable='true']")) return;
      const next = translateText(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    };

    const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) translateNode(walk.currentNode);
    frameObserver?.disconnect();
    frameObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) translateNode(node);
          else if (node.nodeType === Node.ELEMENT_NODE) {
            const sub = doc.createTreeWalker(node, NodeFilter.SHOW_TEXT);
            while (sub.nextNode()) translateNode(sub.currentNode);
          }
        });
        if (mutation.type === "characterData") translateNode(mutation.target);
      }
    });
    frameObserver.observe(doc.body, { childList: true, subtree: true, characterData: true });
  }

  function openTool() {
    $("#loginLayer").hidden = true;
    $("#logoutBtn").hidden = false;
    setBadge(`Cloud: ${user.email}`, true);
    if (!$("#toolFrame").src || $("#toolFrame").src === "about:blank") $("#toolFrame").src = tool.url;
    clearInterval(syncTimer);
    syncTimer = setInterval(() => syncAll(false), Math.max(3000, Number(config.syncIntervalMs) || 5000));
    setTimeout(() => syncAll(false), 900);
  }

  function showLogin() {
    $("#loginLayer").hidden = false;
    $("#logoutBtn").hidden = true;
    setBadge("Cloud: Sign in required", false);
  }

  async function sendOtp() {
    const email = $("#emailInput").value.trim().toLowerCase();
    if (!email || !email.includes("@")) { setMessage("Enter a valid work email."); return; }
    $("#sendOtpBtn").disabled = true;
    setMessage("Sending secure login email...");
    try {
      const { error } = await db.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, emailRedirectTo: location.href }
      });
      if (error) throw error;
      $("#otpArea").hidden = false;
      setMessage("Login email sent. Enter the code below, or open the secure sign-in link from the email.");
    } catch (error) {
      setMessage(error.message || "Could not send the login email.");
    } finally {
      $("#sendOtpBtn").disabled = false;
    }
  }

  async function verifyOtp() {
    const email = $("#emailInput").value.trim().toLowerCase();
    const token = $("#otpInput").value.trim();
    if (!email || !token) { setMessage("Enter your email and email code."); return; }
    $("#verifyOtpBtn").disabled = true;
    setMessage("Verifying code...");
    try {
      const { data, error } = await db.auth.verifyOtp({ email, token, type: "email" });
      if (error) throw error;
      if (!data.session) throw new Error("Login session was not created.");
      user = data.session.user;
      setMessage("");
      openTool();
    } catch (error) {
      setMessage(error.message || "The code is incorrect or expired.");
    } finally {
      $("#verifyOtpBtn").disabled = false;
    }
  }

  async function checkSession() {
    const { data, error } = await db.auth.getSession();
    if (error) { setMessage(error.message); return false; }
    if (data.session?.user) {
      user = data.session.user;
      openTool();
      return true;
    }
    showLogin();
    return false;
  }

  async function init() {
    if (!tool) {
      $("#toolName").textContent = "Unknown Tool";
      $("#loginTitle").textContent = "Invalid tool link";
      setMessage("This tool link is invalid. Return to All Tools and choose an office tool.");
      $("#sendOtpBtn").disabled = true;
      return;
    }
    if (!window.supabase || !config.supabaseUrl || !config.supabasePublishableKey) {
      setMessage("Cloud configuration is not available.");
      return;
    }

    document.title = `${tool.name} — DK User Link`;
    $("#toolIcon").textContent = tool.icon;
    $("#loginIcon").textContent = tool.icon;
    $("#toolName").textContent = tool.name;
    $("#toolNote").textContent = `${tool.note} · Auto cloud save`;
    $("#loginTitle").textContent = `${tool.name} Login`;

    db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    db.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        user = session.user;
        openTool();
      } else if (event === "SIGNED_OUT") {
        user = null;
        clearInterval(syncTimer);
        $("#toolFrame").src = "about:blank";
        showLogin();
      }
    });

    await checkSession();
  }

  $("#sendOtpBtn").addEventListener("click", sendOtp);
  $("#verifyOtpBtn").addEventListener("click", verifyOtp);
  $("#checkLoginBtn").addEventListener("click", checkSession);
  $("#logoutBtn").addEventListener("click", async () => { if (db) await db.auth.signOut(); });
  $("#toolFrame").addEventListener("load", () => {
    translateFrame();
    scheduleSync(700);
    try {
      const doc = $("#toolFrame").contentDocument;
      doc?.addEventListener("click", () => scheduleSync(900), true);
      doc?.addEventListener("input", () => scheduleSync(1200), true);
    } catch {}
  });
  window.addEventListener("storage", (event) => { if (tool?.keys.includes(event.key)) scheduleSync(250); });
  window.addEventListener("online", () => scheduleSync(100));
  document.addEventListener("visibilitychange", () => { if (document.hidden) syncAll(false); });

  init().catch((error) => setMessage(error.message || "User tool could not start."));
})();
