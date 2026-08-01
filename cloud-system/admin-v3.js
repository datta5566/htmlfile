(() => {
  "use strict";

  const config = window.DK_CLOUD_CONFIG || {};
  const OWNER_EMAIL = "kale63633@gmail.com";
  const DEVICE_KEY = "DK_ADMIN_CLOUD_DEVICE_ID";
  const SYNC_PREFIX = "DK_ADMIN_SYNC_V3_";
  const BASELINE_PREFIX = "DK_ADMIN_BASELINE_V3_";
  const WRONG_ATTEMPT_KEY = "DK_ADMIN_WRONG_OTP_COUNT";
  const $ = (selector) => document.querySelector(selector);

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
      url: "../../cl-new-/",
      keys: ["FILE_STORE_PRO_RECORDS_V2"]
    },
    complaint_trace: {
      name: "Customer Complaint",
      icon: "🔎",
      note: "Customer complaint traceability",
      url: "../../cl-new-/#complaintPanel",
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

  const SECTION_NAMES = Object.freeze({
    "whatsapp-safety-saved-records-online-v1": "Safety Records",
    "kaizen_converter_records_v8_combined_v2": "Kaizen Combined Records",
    "dk_kaizen_online_records_v4": "Kaizen Online Records",
    "rejection_records_v2": "Rejection Records V2",
    "rejection_records": "Rejection Records",
    "FILE_STORE_PRO_RECORDS_V2": "Production / Barcode Records",
    "FILE_STORE_PRO_COMPLAINTS_V1": "Complaint Records",
    "dk_pdi_android_reports_v1": "PDI Reports"
  });

  const TRANSLATIONS = [
    ["Pehle Excel/CSV file choose karo.", "Choose an Excel/CSV file first."],
    ["Internet ON karo, Excel engine load nahi hua.", "Turn on the internet; the Excel engine did not load."],
    ["Excel file read ho rahi hai...", "Reading the Excel file..."],
    ["Excel me header/data row nahi mili.", "No header or data row was found in the Excel file."],
    ["Column names match nahi hue.", "Column names did not match."],
    ["Excel rows preview me convert hui. Check karke Save dabao.", "Excel rows were converted to the preview. Review them and click Save."],
    ["File read hui, lekin data rows nahi mili.", "The file was read, but no data rows were found."],
    ["Message convert ya Excel import karne ke baad Save dabao.", "Convert a message or import an Excel file before clicking Save."],
    ["Pehle WhatsApp messages ya Excel file ko preview me convert karo.", "Convert WhatsApp messages or the Excel file to the preview first."],
    ["Main Excel file select karo. File Microsoft Excel me open ho to pehle close kar do.", "Select the main Excel file. Close it in Microsoft Excel before continuing."],
    ["Main Excel file selection cancel hui.", "Main Excel file selection was cancelled."],
    ["Main Excel connection cancel hui.", "Main Excel connection was cancelled."],
    ["Pehle Connect Main Excel — One Time button se file connect karo.", "Connect the main Excel file first using Connect Main Excel — One Time."],
    ["Pehle messages convert karke preview me records lao.", "Convert the messages first so the records appear in the preview."],
    ["Excel file open ho to close karke retry karo.", "If the Excel file is open, close it and try again."],
    ["File / batch name type karo, camera start karo, barcode automatic save hote rahenge.", "Enter the file / batch name, start the camera, and scanned barcodes will save automatically."],
    ["Camera off. File / batch name type karke Start Camera dabao.", "Camera is off. Enter the file / batch name and click Start Camera."],
    ["Website ready. File / batch name type karke camera start karo.", "Website ready. Enter the file / batch name and start the camera."],
    ["Separate storage for 2nd Shift. Scanned barcodes 1st Shift me mix nahi honge.", "Separate storage for 2nd Shift. Scanned barcodes will not mix with 1st Shift records."],
    ["Complaint se Unit Trace karo", "Trace Unit from Customer Complaint"],
    ["Sticker / QR scan karne par app barcode, part, unit aur customer details samajhne ki koshish karega.", "Scanning a sticker / QR code will identify barcode, part, unit, and customer details when available."],
    ["Barcode trace result yaha dikhai dega.", "The barcode trace result will appear here."],
    ["Ab Save Directly button isi file ko update karega.", "The Save Directly button will now update this file."],
    ["Saved connection", "Saved connection"],
    ["Save करते समय permission allow करें.", "Allow permission when saving."],
    ["यह account Administrator नहीं है।", "This account is not an Administrator."],
    ["यहाँ", "Here"],
    ["केवल", "Only"],
    ["दिखेगा", "will be shown"],
    ["रिकॉर्ड", "record"]
  ];

  let cloudDb = null;
  let currentUser = null;
  let activeTool = null;
  let snapshots = [];
  let displayRows = [];
  let syncTimer = null;
  let syncBusy = false;
  let resendTimer = null;

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[char]));
  }

  function configured() {
    return Boolean(config.supabaseUrl && config.supabasePublishableKey && window.supabase);
  }

  function sectionName(key) {
    return SECTION_NAMES[key] || String(key || "Saved Data").replaceAll("_", " ");
  }

  function getDeviceId() {
    let value = localStorage.getItem(DEVICE_KEY);
    if (!value) {
      value = crypto.randomUUID ? crypto.randomUUID() : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(DEVICE_KEY, value);
    }
    return value;
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

  function recordList(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object") return [payload];
    if (String(payload ?? "").trim()) return [{ value: payload }];
    return [];
  }

  function itemCount(payload) {
    return recordList(payload).length;
  }

  function recordForHash(record) {
    if (!record || typeof record !== "object" || Array.isArray(record)) return record;
    const copy = { ...record };
    delete copy.fileData;
    delete copy.cloudFilePath;
    delete copy.cloudFileName;
    delete copy.cloudFileType;
    delete copy.cloudFileUploadError;
    return copy;
  }

  function cleanFileName(value) {
    return String(value || "uploaded-file").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120);
  }

  async function uploadDataUrl(dataUrl, record, appCode, deviceId) {
    const signature = await sha256(`${dataUrl.length}:${dataUrl.slice(0, 160)}`);
    const cacheKey = `DK_CLOUD_FILE_${currentUser.id}_${signature}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached;
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const recordId = cleanFileName(record.id || record.barcode || signature.slice(0, 16));
    const fileName = cleanFileName(record.fileName || `file-${signature.slice(0, 12)}`);
    const path = `${currentUser.id}/${appCode}/${deviceId}/${recordId}/${fileName}`;
    const { error } = await cloudDb.storage.from(config.storageBucket || "dk-app-files").upload(path, blob, {
      upsert: true,
      contentType: record.fileType || blob.type || "application/octet-stream"
    });
    if (error) throw error;
    localStorage.setItem(cacheKey, path);
    return path;
  }

  async function prepareRecord(record, appCode, deviceId) {
    if (!record || typeof record !== "object" || Array.isArray(record)) return record;
    const copy = { ...record };
    if (typeof copy.fileData === "string" && copy.fileData.startsWith("data:")) {
      try {
        copy.cloudFilePath = await uploadDataUrl(copy.fileData, copy, appCode, deviceId);
        copy.cloudFileName = copy.fileName || "uploaded-file";
        copy.cloudFileType = copy.fileType || "application/octet-stream";
      } catch (error) {
        copy.cloudFileUploadError = error.message || "File upload failed";
      }
      delete copy.fileData;
    }
    return copy;
  }

  async function preparePayload(payload, appCode, deviceId) {
    if (Array.isArray(payload)) {
      const output = [];
      for (const record of payload) output.push(await prepareRecord(record, appCode, deviceId));
      return output;
    }
    return prepareRecord(payload, appCode, deviceId);
  }

  async function syncRecordEvents(appCode, storageKey, originalPayload, cloudPayload, deviceId) {
    const baselineKey = `${BASELINE_PREFIX}${currentUser.id}_${appCode}_${storageKey}`;
    const firstSync = localStorage.getItem(baselineKey) !== "1";
    const originals = recordList(originalPayload);
    const cloudRecords = recordList(cloudPayload);
    const rows = [];
    for (let index = 0; index < originals.length; index += 1) {
      rows.push({
        user_id: currentUser.id,
        app_code: appCode,
        device_id: deviceId,
        storage_key: storageKey,
        record_hash: await sha256(JSON.stringify(recordForHash(originals[index]))),
        record_index: index,
        record_data: cloudRecords[index] ?? originals[index],
        notify_admin: !firstSync
      });
    }
    if (rows.length) {
      const { error } = await cloudDb.from("app_events").upsert(rows, {
        onConflict: "user_id,app_code,device_id,storage_key,record_hash",
        ignoreDuplicates: true
      });
      if (error) throw error;
    }
    localStorage.setItem(baselineKey, "1");
  }

  async function syncOne(appCode, storageKey, force = false) {
    const tool = TOOLS[appCode];
    const raw = localStorage.getItem(storageKey) ?? "[]";
    const fingerprint = await sha256(raw);
    const cacheKey = `${SYNC_PREFIX}${currentUser.id}_${appCode}_${storageKey}`;
    const baselineKey = `${BASELINE_PREFIX}${currentUser.id}_${appCode}_${storageKey}`;
    if (!force && localStorage.getItem(cacheKey) === fingerprint && localStorage.getItem(baselineKey) === "1") return false;
    const deviceId = getDeviceId();
    const originalPayload = safeJson(raw);
    const cloudPayload = await preparePayload(originalPayload, appCode, deviceId);
    const { error } = await cloudDb.from("app_snapshots").upsert({
      user_id: currentUser.id,
      app_code: appCode,
      device_id: deviceId,
      storage_key: storageKey,
      source_url: new URL(tool.url, location.href).href,
      payload: cloudPayload,
      item_count: itemCount(originalPayload),
      client_updated_at: new Date().toISOString()
    }, { onConflict: "user_id,app_code,device_id,storage_key" });
    if (error) throw error;
    await syncRecordEvents(appCode, storageKey, originalPayload, cloudPayload, deviceId);
    localStorage.setItem(cacheKey, fingerprint);
    return true;
  }

  async function syncSelectedTool(force = false) {
    if (!currentUser || !activeTool || syncBusy) return;
    syncBusy = true;
    const tool = TOOLS[activeTool];
    $("#dashboardStatus").textContent = "Saving to cloud...";
    try {
      let changed = 0;
      for (const key of tool.keys) if (await syncOne(activeTool, key, force)) changed += 1;
      await fetchSelectedToolData();
      $("#dashboardStatus").textContent = changed ? `Saved ${changed} section(s)` : "Cloud data is up to date";
    } catch (error) {
      $("#dashboardStatus").textContent = error.message || "Cloud sync failed";
    } finally {
      syncBusy = false;
    }
  }

  function summary(record) {
    if (!record || typeof record !== "object") return String(record ?? "");
    const keys = ["NAME", "employeeName", "complaintNo", "customerName", "barcode", "Part Barcode", "partName", "Part Name", "OBSERVATION FOUND", "rejection", "unit", "kn", "shift", "value"];
    const values = keys.map((key) => record[key]).filter((value) => value !== undefined && value !== null && String(value).trim()).slice(0, 5);
    return values.length ? values.join(" | ") : Object.entries(record).slice(0, 4).map(([key, value]) => `${key}: ${String(value).slice(0, 80)}`).join(" | ");
  }

  function flattenSnapshots() {
    const output = [];
    snapshots.forEach((snapshot) => {
      recordList(snapshot.payload).forEach((record, index) => output.push({
        id: `${snapshot.id}:${index}`,
        storage_key: snapshot.storage_key,
        updated_at: snapshot.client_updated_at || snapshot.updated_at || snapshot.created_at,
        record_data: record
      }));
    });
    return output;
  }

  async function fetchSelectedToolData() {
    if (!activeTool) return;
    const { data, error } = await cloudDb.from("app_snapshots").select("id,storage_key,payload,item_count,client_updated_at,created_at,updated_at").eq("app_code", activeTool).order("updated_at", { ascending: false });
    if (error) throw error;
    snapshots = data || [];
    displayRows = flattenSnapshots();
    renderSelectedData();
  }

  function filteredRows() {
    const term = $("#searchBox").value.trim().toLowerCase();
    if (!term) return displayRows;
    return displayRows.filter((row) => JSON.stringify(row.record_data).toLowerCase().includes(term) || sectionName(row.storage_key).toLowerCase().includes(term));
  }

  function renderSelectedData() {
    if (!activeTool) return;
    const rows = filteredRows();
    $("#sectionCount").textContent = new Set(snapshots.map((row) => row.storage_key)).size;
    $("#recordCount").textContent = displayRows.length;
    $("#dataTitle").textContent = `${TOOLS[activeTool].name} — Saved Cloud Data`;
    $("#recordsBody").innerHTML = rows.length ? rows.map((row, index) => {
      const hasFile = Boolean(row.record_data?.cloudFilePath);
      return `<tr><td>${index + 1}</td><td>${esc(sectionName(row.storage_key))}</td><td>${esc(new Date(row.updated_at).toLocaleString("en-IN"))}</td><td class="record-summary" title="${esc(summary(row.record_data))}">${esc(summary(row.record_data))}</td><td><button class="btn soft view-json" data-id="${esc(row.id)}" type="button">View</button></td><td>${hasFile ? `<button class="btn soft download-file" data-id="${esc(row.id)}" type="button">Open File</button>` : "-"}</td></tr>`;
    }).join("") : '<tr><td class="empty" colspan="6">No cloud data is available for this tool yet. Save a record in the tool, then click Save / Sync Now.</td></tr>';
    document.querySelectorAll(".view-json").forEach((button) => button.addEventListener("click", () => showJson(button.dataset.id)));
    document.querySelectorAll(".download-file").forEach((button) => button.addEventListener("click", () => downloadCloudFile(button.dataset.id)));
  }

  function showJson(id) {
    const row = displayRows.find((item) => item.id === id);
    if (!row) return;
    $("#jsonContent").textContent = JSON.stringify(row.record_data, null, 2);
    $("#jsonModal").hidden = false;
  }

  async function downloadCloudFile(id) {
    const row = displayRows.find((item) => item.id === id);
    const path = row?.record_data?.cloudFilePath;
    if (!path) return;
    const { data, error } = await cloudDb.storage.from(config.storageBucket || "dk-app-files").createSignedUrl(path, 60);
    if (error) { $("#dashboardStatus").textContent = error.message; return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  function translateString(text) {
    let value = String(text ?? "");
    for (const [from, to] of TRANSLATIONS) value = value.split(from).join(to);
    return value;
  }

  function translateDocument(doc) {
    if (!doc?.body) return;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (node.parentElement?.matches("script,style,noscript")) return;
      const translated = translateString(node.nodeValue);
      if (translated !== node.nodeValue) node.nodeValue = translated;
    });
    doc.querySelectorAll("[placeholder],[title],[aria-label]").forEach((element) => {
      for (const attr of ["placeholder", "title", "aria-label"]) {
        if (!element.hasAttribute(attr)) continue;
        const oldValue = element.getAttribute(attr);
        const newValue = translateString(oldValue);
        if (newValue !== oldValue) element.setAttribute(attr, newValue);
      }
    });
  }

  function enableEnglishToolView() {
    const frame = $("#toolFrame");
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      translateDocument(doc);
      const observer = new MutationObserver(() => translateDocument(doc));
      observer.observe(doc.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label"] });
    } catch {
      // Same-origin tools are translated. Cross-origin pages remain unchanged.
    }
  }

  function renderToolButtons() {
    $("#toolButtons").innerHTML = Object.entries(TOOLS).map(([code, tool]) => `<button class="tool-card" type="button" data-tool="${esc(code)}"><div class="tool-icon">${tool.icon}</div><strong>${esc(tool.name)}</strong><small>${esc(tool.note)}</small></button>`).join("");
    document.querySelectorAll(".tool-card").forEach((button) => button.addEventListener("click", () => openTool(button.dataset.tool)));
  }

  async function openTool(code) {
    const tool = TOOLS[code];
    if (!tool) return;
    activeTool = code;
    snapshots = [];
    displayRows = [];
    $("#searchBox").value = "";
    $("#launcherView").hidden = true;
    $("#toolView").hidden = false;
    $("#activeToolIcon").textContent = tool.icon;
    $("#activeToolName").textContent = tool.name;
    $("#activeToolNote").textContent = `${tool.note} · Only this tool's saved data is shown below`;
    $("#toolFrame").src = tool.url;
    $("#dashboardStatus").textContent = "Opening tool...";
    await fetchSelectedToolData().catch((error) => $("#dashboardStatus").textContent = error.message);
    clearInterval(syncTimer);
    syncTimer = setInterval(() => syncSelectedTool(false), Math.max(10000, Number(config.syncIntervalMs) || 15000));
  }

  function showHome() {
    activeTool = null;
    clearInterval(syncTimer);
    syncTimer = null;
    $("#toolFrame").src = "about:blank";
    $("#toolView").hidden = true;
    $("#launcherView").hidden = false;
  }

  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv() {
    if (!activeTool) return;
    const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const lines = [["Data Section", "Updated", "Record JSON"].map(quote).join(",")];
    filteredRows().forEach((row) => lines.push([sectionName(row.storage_key), row.updated_at, JSON.stringify(row.record_data)].map(quote).join(",")));
    download(lines.join("\n"), `${activeTool}-cloud-data.csv`, "text/csv;charset=utf-8");
  }

  function exportJson() {
    if (!activeTool) return;
    download(JSON.stringify({ tool: activeTool, exported_at: new Date().toISOString(), records: displayRows }, null, 2), `${activeTool}-cloud-backup.json`, "application/json");
  }

  function wrongAttempts() {
    return Number(sessionStorage.getItem(WRONG_ATTEMPT_KEY) || 0);
  }

  function setWrongAttempts(count) {
    sessionStorage.setItem(WRONG_ATTEMPT_KEY, String(count));
    const box = $("#contactAdminBox");
    if (box) box.hidden = count < 3;
  }

  function startResendCooldown(seconds = 60) {
    clearInterval(resendTimer);
    let remaining = seconds;
    const button = $("#sendCodeBtn");
    button.disabled = true;
    button.textContent = `Resend in ${remaining}s`;
    resendTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(resendTimer);
        button.disabled = false;
        button.textContent = "Send Login Code";
      } else button.textContent = `Resend in ${remaining}s`;
    }, 1000);
  }

  async function sendLoginCode() {
    $("#loginMessage").textContent = "Sending a secure login code to the administrator email...";
    const { error } = await cloudDb.auth.signInWithOtp({
      email: OWNER_EMAIL,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: location.href.split("#")[0]
      }
    });
    if (error) {
      $("#loginMessage").textContent = error.message;
      return;
    }
    $("#otpPanel").hidden = false;
    $("#loginMessage").textContent = "Login email sent. Enter the code from the email. If the email contains a secure sign-in link instead, open that link.";
    startResendCooldown(60);
    $("#otpCode").focus();
  }

  async function verifyLoginCode(event) {
    event.preventDefault();
    const token = $("#otpCode").value.trim();
    if (!/^\d{6,8}$/.test(token)) {
      $("#loginMessage").textContent = "Enter the numeric login code from the email.";
      return;
    }
    $("#verifyCodeBtn").disabled = true;
    $("#loginMessage").textContent = "Verifying code...";
    const { data, error } = await cloudDb.auth.verifyOtp({ email: OWNER_EMAIL, token, type: "email" });
    if (error || !data.session) {
      const count = wrongAttempts() + 1;
      setWrongAttempts(count);
      $("#loginMessage").textContent = count >= 3 ? "Three incorrect codes were entered. Please contact the administrator before continuing." : `Incorrect or expired code. Attempt ${count} of 3.`;
      $("#verifyCodeBtn").disabled = false;
      return;
    }
    setWrongAttempts(0);
    location.reload();
  }

  async function verifyAdmin(session) {
    currentUser = session.user;
    if ((currentUser.email || "").toLowerCase() !== OWNER_EMAIL) {
      await cloudDb.auth.signOut();
      $("#loginMessage").textContent = "Access denied. This dashboard is restricted to the authorized administrator email.";
      return;
    }
    const { data, error } = await cloudDb.from("profiles").select("email,display_name,role").eq("id", currentUser.id).single();
    if (error || data?.role !== "admin" || String(data?.email || currentUser.email).toLowerCase() !== OWNER_EMAIL) {
      await cloudDb.auth.signOut();
      $("#loginMessage").textContent = "Access denied. Administrator role verification failed.";
      return;
    }
    setWrongAttempts(0);
    $("#adminUser").textContent = OWNER_EMAIL;
    $("#loginPanel").hidden = true;
    $("#dashboard").hidden = false;
    $("#logoutBtn").hidden = false;
    renderToolButtons();
    showHome();
  }

  async function init() {
    if (!configured()) {
      $("#loginMessage").textContent = "Cloud configuration is not ready.";
      return;
    }
    $("#ownerEmail").textContent = OWNER_EMAIL;
    setWrongAttempts(wrongAttempts());
    cloudDb = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const { data } = await cloudDb.auth.getSession();
    if (data.session) await verifyAdmin(data.session);
  }

  $("#sendCodeBtn").addEventListener("click", sendLoginCode);
  $("#otpForm").addEventListener("submit", verifyLoginCode);
  $("#backToolsBtn").addEventListener("click", showHome);
  $("#syncNowBtn").addEventListener("click", () => syncSelectedTool(true));
  $("#refreshBtn").addEventListener("click", () => fetchSelectedToolData().catch((error) => $("#dashboardStatus").textContent = error.message));
  $("#exportCsvBtn").addEventListener("click", exportCsv);
  $("#exportJsonBtn").addEventListener("click", exportJson);
  $("#searchBox").addEventListener("input", renderSelectedData);
  $("#closeModalBtn").addEventListener("click", () => $("#jsonModal").hidden = true);
  $("#jsonModal").addEventListener("click", (event) => { if (event.target.id === "jsonModal") $("#jsonModal").hidden = true; });
  $("#toolFrame").addEventListener("load", () => {
    if (!activeTool) return;
    enableEnglishToolView();
    setTimeout(() => syncSelectedTool(false), 700);
  });
  window.addEventListener("storage", () => { if (activeTool) setTimeout(() => syncSelectedTool(false), 300); });
  window.addEventListener("online", () => { if (activeTool) syncSelectedTool(false); });
  $("#logoutBtn").addEventListener("click", async () => {
    clearInterval(syncTimer);
    await cloudDb.auth.signOut();
    location.reload();
  });

  init().catch((error) => $("#loginMessage").textContent = error.message || "Dashboard could not start.");
})();
