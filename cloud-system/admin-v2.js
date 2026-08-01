(() => {
  "use strict";

  const config = window.DK_CLOUD_CONFIG || {};
  const $ = (selector) => document.querySelector(selector);
  const ADMIN_ID = "admin";
  const ADMIN_EMAIL_KEY = "DK_PRIVATE_ADMIN_EMAIL";
  const DEVICE_KEY = "DK_ADMIN_CLOUD_DEVICE_ID";
  const SYNC_PREFIX = "DK_ADMIN_SYNC_";
  const BASELINE_PREFIX = "DK_ADMIN_BASELINE_";

  const TOOLS = Object.freeze({
    ua_uc: {
      name: "UA / UC / Near Miss",
      icon: "🛡️",
      note: "Latest Safety Data Hub",
      url: "../ua-uc/",
      keys: ["whatsapp-safety-saved-records-online-v1"]
    },
    kaizen: {
      name: "Kaizen Converter",
      icon: "💡",
      note: "Kaizen records & conversion",
      url: "../kaizen/",
      keys: ["kaizen_converter_records_v8_combined_v2", "dk_kaizen_online_records_v4"]
    },
    rejection: {
      name: "Rejection Management",
      icon: "📊",
      note: "Rejection, rework & quality records",
      url: "../Rejection_Management_System_V2_Ultra_Professional.html",
      keys: ["rejection_records_v2", "rejection_records"]
    },
    file_store: {
      name: "File Store Pro",
      icon: "📁",
      note: "KN-wise barcode & file records",
      url: "../../cl-new-/",
      keys: ["FILE_STORE_PRO_RECORDS_V2"]
    },
    complaint_trace: {
      name: "Customer Complaint",
      icon: "🔎",
      note: "Complaint traceability records",
      url: "../../cl-new-/#complaintPanel",
      keys: ["FILE_STORE_PRO_COMPLAINTS_V1"]
    },
    pdi_scanner: {
      name: "DK PDI Scanner",
      icon: "📷",
      note: "PDI scan & report history",
      url: "../DK_PDI_Android/app/src/main/assets/index.html",
      keys: ["dk_pdi_android_reports_v1"]
    },
    video_studio: {
      name: "AI Short Video Studio",
      icon: "🎬",
      note: "Video prompt presets",
      url: "../AI_Short_Video_Studio/",
      keys: ["dk_video_preset", "dk_last_prompt"]
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
    "dk_pdi_android_reports_v1": "PDI Reports",
    "dk_video_preset": "Video Preset",
    "dk_last_prompt": "Last Video Prompt"
  });

  let cloudDb = null;
  let currentUser = null;
  let activeTool = null;
  let snapshots = [];
  let displayRows = [];
  let syncTimer = null;
  let syncBusy = false;

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

  function itemCount(payload) {
    if (Array.isArray(payload)) return payload.length;
    if (payload && typeof payload === "object") return 1;
    return String(payload ?? "").trim() ? 1 : 0;
  }

  function recordList(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object") return [payload];
    if (String(payload ?? "").trim()) return [{ value: payload }];
    return [];
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
      const recordHash = await sha256(JSON.stringify(recordForHash(originals[index])));
      rows.push({
        user_id: currentUser.id,
        app_code: appCode,
        device_id: deviceId,
        storage_key: storageKey,
        record_hash: recordHash,
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
    const same = localStorage.getItem(cacheKey) === fingerprint;
    const needsBaseline = localStorage.getItem(baselineKey) !== "1";
    if (!force && same && !needsBaseline) return false;

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
      $("#dashboardStatus").textContent = changed ? `Saved ${changed} section · ${new Date().toLocaleTimeString("en-IN")}` : `Cloud up to date · ${new Date().toLocaleTimeString("en-IN")}`;
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
      const records = recordList(snapshot.payload);
      records.forEach((record, index) => output.push({
        id: `${snapshot.id}:${index}`,
        snapshot_id: snapshot.id,
        storage_key: snapshot.storage_key,
        updated_at: snapshot.client_updated_at || snapshot.updated_at || snapshot.created_at,
        record_data: record,
        record_index: index
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
    const rows = filteredRows();
    $("#sectionCount").textContent = new Set(snapshots.map((row) => row.storage_key)).size;
    $("#recordCount").textContent = displayRows.length;
    $("#dataTitle").textContent = `${TOOLS[activeTool].name} — Saved Cloud Data`;
    $("#recordsBody").innerHTML = rows.length ? rows.map((row, index) => {
      const hasFile = Boolean(row.record_data?.cloudFilePath);
      return `<tr><td>${index + 1}</td><td>${esc(sectionName(row.storage_key))}</td><td>${esc(new Date(row.updated_at).toLocaleString("en-IN"))}</td><td class="record-summary" title="${esc(summary(row.record_data))}">${esc(summary(row.record_data))}</td><td><button class="btn soft view-json" data-id="${esc(row.id)}" type="button">View</button></td><td>${hasFile ? `<button class="btn soft download-file" data-id="${esc(row.id)}" type="button">Open File</button>` : "-"}</td></tr>`;
    }).join("") : '<tr><td class="empty" colspan="6">इस tool का cloud data अभी नहीं है। Tool में record Save करें और Save / Sync Now दबाएँ।</td></tr>';

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
    $("#activeToolNote").textContent = `${tool.note} · केवल इसी tool का data नीचे दिखेगा`;
    $("#toolFrame").src = tool.url;
    $("#dashboardStatus").textContent = "Opening tool...";
    await fetchSelectedToolData().catch((error) => $("#dashboardStatus").textContent = error.message);
    startAutoSync();
  }

  function showHome() {
    activeTool = null;
    clearInterval(syncTimer);
    syncTimer = null;
    $("#toolFrame").src = "about:blank";
    $("#toolView").hidden = true;
    $("#launcherView").hidden = false;
  }

  function startAutoSync() {
    clearInterval(syncTimer);
    const interval = Math.max(10000, Number(config.syncIntervalMs) || 15000);
    syncTimer = setInterval(() => syncSelectedTool(false), interval);
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
    const rows = filteredRows();
    const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const lines = [["Data Section", "Updated", "Record JSON"].map(quote).join(",")];
    rows.forEach((row) => lines.push([sectionName(row.storage_key), row.updated_at, JSON.stringify(row.record_data)].map(quote).join(",")));
    download(lines.join("\n"), `${activeTool}-cloud-data.csv`, "text/csv;charset=utf-8");
  }

  function exportJson() {
    if (!activeTool) return;
    download(JSON.stringify({ tool: activeTool, exported_at: new Date().toISOString(), records: displayRows }, null, 2), `${activeTool}-cloud-backup.json`, "application/json");
  }

  async function verifyAdmin(session) {
    currentUser = session.user;
    const { data, error } = await cloudDb.from("profiles").select("email,display_name,role").eq("id", currentUser.id).single();
    if (error || data?.role !== "admin") {
      $("#loginMessage").textContent = "यह account Administrator नहीं है।";
      await cloudDb.auth.signOut();
      return;
    }
    $("#adminUser").textContent = data.email || currentUser.email || "Admin";
    $("#loginPanel").hidden = true;
    $("#dashboard").hidden = false;
    $("#logoutBtn").hidden = false;
    renderToolButtons();
    showHome();
  }

  async function init() {
    if (!configured()) { $("#loginMessage").textContent = "Cloud configuration pending."; return; }
    cloudDb = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const { data } = await cloudDb.auth.getSession();
    if (data.session) await verifyAdmin(data.session);

    cloudDb.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        if (session?.user?.email) localStorage.setItem(ADMIN_EMAIL_KEY, session.user.email.toLowerCase());
        $("#adminPasswordForm").hidden = true;
        $("#adminSetupForm").hidden = true;
        $("#newPasswordForm").hidden = false;
        $("#loginMessage").textContent = "नया password बनाएं।";
        return;
      }
      if (session && (!currentUser || currentUser.id !== session.user.id)) verifyAdmin(session).catch((error) => $("#loginMessage").textContent = error.message);
      if (!session) currentUser = null;
    });
  }

  $("#adminPasswordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if ($("#adminId").value.trim().toLowerCase() !== ADMIN_ID) { $("#loginMessage").textContent = "Admin ID गलत है।"; return; }
    const adminEmail = localStorage.getItem(ADMIN_EMAIL_KEY);
    if (!adminEmail) { $("#loginMessage").textContent = "पहली बार Setup Admin Password दबाएँ।"; return; }
    $("#loginMessage").textContent = "Login हो रहा है...";
    const { data, error } = await cloudDb.auth.signInWithPassword({ email: adminEmail, password: $("#adminPassword").value });
    if (error) { $("#loginMessage").textContent = "Password गलत है या Admin setup बाकी है।"; return; }
    if (data.session) await verifyAdmin(data.session);
  });

  $("#showSetupBtn").addEventListener("click", () => {
    $("#adminPasswordForm").hidden = true;
    $("#adminSetupForm").hidden = false;
    $("#setupAdminEmail").value = localStorage.getItem(ADMIN_EMAIL_KEY) || "";
  });

  $("#cancelSetupBtn").addEventListener("click", () => {
    $("#adminSetupForm").hidden = true;
    $("#adminPasswordForm").hidden = false;
  });

  $("#adminSetupForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("#setupAdminEmail").value.trim().toLowerCase();
    if (!email) return;
    localStorage.setItem(ADMIN_EMAIL_KEY, email);
    $("#loginMessage").textContent = "Password link भेजा जा रहा है...";
    const { error } = await cloudDb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0] });
    $("#loginMessage").textContent = error ? error.message : "Email में आए password-setting link को खोलें।";
  });

  $("#newPasswordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const { data, error } = await cloudDb.auth.updateUser({ password: $("#newAdminPassword").value });
    if (error) { $("#loginMessage").textContent = error.message; return; }
    if (data.user?.email) localStorage.setItem(ADMIN_EMAIL_KEY, data.user.email.toLowerCase());
    $("#loginMessage").textContent = "Password save हो गया। अब login करें।";
    await cloudDb.auth.signOut();
    location.reload();
  });

  $("#backToolsBtn").addEventListener("click", showHome);
  $("#syncNowBtn").addEventListener("click", () => syncSelectedTool(true));
  $("#refreshBtn").addEventListener("click", () => fetchSelectedToolData().catch((error) => $("#dashboardStatus").textContent = error.message));
  $("#exportCsvBtn").addEventListener("click", exportCsv);
  $("#exportJsonBtn").addEventListener("click", exportJson);
  $("#searchBox").addEventListener("input", renderSelectedData);
  $("#closeModalBtn").addEventListener("click", () => $("#jsonModal").hidden = true);
  $("#jsonModal").addEventListener("click", (event) => { if (event.target.id === "jsonModal") $("#jsonModal").hidden = true; });
  $("#toolFrame").addEventListener("load", () => { if (activeTool) setTimeout(() => syncSelectedTool(false), 700); });
  window.addEventListener("storage", () => { if (activeTool) setTimeout(() => syncSelectedTool(false), 300); });
  window.addEventListener("online", () => { if (activeTool) syncSelectedTool(false); });
  $("#logoutBtn").addEventListener("click", async () => { clearInterval(syncTimer); await cloudDb.auth.signOut(); location.reload(); });

  init().catch((error) => $("#loginMessage").textContent = error.message || "Dashboard start नहीं हुआ।");
})();
