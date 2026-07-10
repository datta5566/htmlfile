(() => {
  "use strict";

  const APPS = {
    ua_uc_main: {
      name: "UA/UC Converter",
      url: "../index.html",
      keys: ["whatsapp-safety-saved-records-online-v1"]
    },
    ua_uc: {
      name: "UA/UC Alternate",
      url: "../ua-uc/",
      keys: ["whatsapp-safety-saved-records-online-v1"]
    },
    kaizen: {
      name: "Kaizen Converter",
      url: "../kaizen/",
      keys: ["dk_kaizen_online_records_v4"]
    },
    rejection: {
      name: "Rejection Management",
      url: "../Rejection_Management_System_V2_Ultra_Professional.html",
      keys: ["rejection_records_v2", "rejection_records"]
    },
    file_store: {
      name: "File Store Pro",
      url: "../../cl-new-/",
      keys: ["FILE_STORE_PRO_RECORDS_V2", "FILE_STORE_PRO_COMPLAINTS_V1"]
    }
  };

  const config = window.DK_CLOUD_CONFIG || {};
  const $ = (selector) => document.querySelector(selector);
  const authPanel = $("#authPanel");
  const portalPanel = $("#portalPanel");
  const setupPanel = $("#setupPanel");
  const statusEl = $("#cloudStatus");
  const frame = $("#appFrame");
  const syncDetails = $("#syncDetails");

  let cloudDb = null;
  let currentUser = null;
  let activeAppCode = "ua_uc_main";
  let syncTimer = null;
  let syncBusy = false;

  function configReady() {
    return Boolean(
      config.supabaseUrl &&
      config.supabasePublishableKey &&
      !String(config.supabaseUrl).startsWith("PASTE_") &&
      !String(config.supabasePublishableKey).startsWith("PASTE_")
    );
  }

  function setStatus(message, type = "info") {
    statusEl.textContent = message;
    statusEl.dataset.type = type;
  }

  function getDeviceId() {
    const key = "DK_CLOUD_DEVICE_ID";
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(key, id);
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
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return { value: raw };
    }
  }

  function itemCount(payload) {
    if (Array.isArray(payload)) return payload.length;
    if (payload && typeof payload === "object") return 1;
    return payload ? 1 : 0;
  }

  function cleanFileName(value) {
    return String(value || "uploaded-file")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 120);
  }

  async function uploadDataUrl(dataUrl, record, appCode, deviceId) {
    const signature = await sha256(`${dataUrl.length}:${dataUrl.slice(0, 160)}`);
    const cacheKey = `DK_CLOUD_FILE_${currentUser.id}_${signature}`;
    const cachedPath = localStorage.getItem(cacheKey);
    if (cachedPath) return cachedPath;

    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const recordId = cleanFileName(record.id || record.barcode || signature.slice(0, 16));
    const fileName = cleanFileName(record.fileName || `file-${signature.slice(0, 12)}`);
    const path = `${currentUser.id}/${appCode}/${deviceId}/${recordId}/${fileName}`;

    const { error } = await cloudDb.storage
      .from(config.storageBucket || "dk-app-files")
      .upload(path, blob, {
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
        delete copy.fileData;
      } catch (error) {
        copy.cloudFileUploadError = error.message || "File upload failed";
        delete copy.fileData;
      }
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

  async function syncOne(appCode, storageKey, force = false) {
    const app = APPS[appCode];
    const raw = localStorage.getItem(storageKey) ?? "[]";
    const fingerprint = await sha256(raw);
    const cacheKey = `DK_CLOUD_SYNC_${currentUser.id}_${appCode}_${storageKey}`;

    if (!force && localStorage.getItem(cacheKey) === fingerprint) {
      return { changed: false, count: itemCount(safeJson(raw)) };
    }

    const deviceId = getDeviceId();
    const originalPayload = safeJson(raw);
    const cloudPayload = await preparePayload(originalPayload, appCode, deviceId);

    const { error } = await cloudDb
      .from("app_snapshots")
      .upsert({
        user_id: currentUser.id,
        app_code: appCode,
        device_id: deviceId,
        storage_key: storageKey,
        source_url: new URL(app.url, location.href).href,
        payload: cloudPayload,
        item_count: itemCount(originalPayload),
        client_updated_at: new Date().toISOString()
      }, { onConflict: "user_id,app_code,device_id,storage_key" });

    if (error) throw error;
    localStorage.setItem(cacheKey, fingerprint);
    return { changed: true, count: itemCount(originalPayload) };
  }

  async function syncAll(force = false) {
    if (!currentUser || syncBusy) return;
    syncBusy = true;
    setStatus("Cloud sync chal raha hai...", "working");

    let changed = 0;
    let total = 0;
    const errors = [];

    try {
      const seen = new Set();
      for (const [appCode, app] of Object.entries(APPS)) {
        for (const storageKey of app.keys) {
          const unique = `${appCode}:${storageKey}`;
          if (seen.has(unique)) continue;
          seen.add(unique);
          try {
            const result = await syncOne(appCode, storageKey, force);
            if (result.changed) changed += 1;
            total += result.count;
          } catch (error) {
            errors.push(`${app.name}: ${error.message || "sync failed"}`);
          }
        }
      }

      if (errors.length) {
        setStatus(`Kuch data sync nahi hua (${errors.length} error).`, "error");
        syncDetails.textContent = errors.join(" | ");
      } else {
        setStatus(`Cloud safe: ${total} records, ${changed} section updated.`, "success");
        syncDetails.textContent = `Last sync: ${new Date().toLocaleString("en-IN")}`;
      }
    } finally {
      syncBusy = false;
    }
  }

  function startAutoSync() {
    clearInterval(syncTimer);
    const interval = Math.max(10000, Number(config.syncIntervalMs) || 15000);
    syncTimer = setInterval(() => syncAll(false), interval);
  }

  function stopAutoSync() {
    clearInterval(syncTimer);
    syncTimer = null;
  }

  function renderAppButtons() {
    const host = $("#appButtons");
    host.innerHTML = "";
    Object.entries(APPS).forEach(([code, app]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "app-button";
      button.dataset.appCode = code;
      button.textContent = app.name;
      button.addEventListener("click", () => openApp(code));
      host.appendChild(button);
    });
  }

  function openApp(code) {
    activeAppCode = code;
    const app = APPS[code];
    frame.src = app.url;
    $("#activeAppName").textContent = app.name;
    document.querySelectorAll(".app-button").forEach((button) => {
      button.classList.toggle("active", button.dataset.appCode === code);
    });
    setTimeout(() => syncAll(false), 1200);
  }

  async function showPortal(session) {
    currentUser = session.user;
    authPanel.hidden = true;
    setupPanel.hidden = true;
    portalPanel.hidden = false;
    $("#currentUser").textContent = currentUser.email || currentUser.id;
    openApp(activeAppCode);
    await syncAll(true);
    startAutoSync();
  }

  function showLogin() {
    currentUser = null;
    stopAutoSync();
    portalPanel.hidden = true;
    setupPanel.hidden = true;
    authPanel.hidden = false;
    setStatus("Login karke cloud apps use karo.", "info");
  }

  async function init() {
    renderAppButtons();

    if (!configReady()) {
      authPanel.hidden = true;
      portalPanel.hidden = true;
      setupPanel.hidden = false;
      setStatus("Cloud configuration pending hai.", "error");
      return;
    }

    cloudDb = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    const { data } = await cloudDb.auth.getSession();
    if (data.session) await showPortal(data.session);
    else showLogin();

    cloudDb.auth.onAuthStateChange((_event, session) => {
      if (session && (!currentUser || currentUser.id !== session.user.id)) showPortal(session);
      if (!session && currentUser) showLogin();
    });
  }

  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("#email").value.trim();
    const password = $("#password").value;
    const { error } = await cloudDb.auth.signInWithPassword({ email, password });
    $("#authMessage").textContent = error ? error.message : "Login successful.";
  });

  $("#signupBtn").addEventListener("click", async () => {
    const email = $("#email").value.trim();
    const password = $("#password").value;
    const displayName = $("#displayName").value.trim();
    if (!email || password.length < 6) {
      $("#authMessage").textContent = "Valid email aur minimum 6 character password enter karo.";
      return;
    }
    const { data, error } = await cloudDb.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName || email.split("@")[0] } }
    });
    $("#authMessage").textContent = error
      ? error.message
      : (data.session ? "Account ready." : "Email confirmation link check karo.");
  });

  $("#logoutBtn").addEventListener("click", async () => {
    await syncAll(true);
    await cloudDb.auth.signOut();
  });

  $("#syncNowBtn").addEventListener("click", () => syncAll(true));
  frame.addEventListener("load", () => setTimeout(() => syncAll(false), 800));
  window.addEventListener("storage", () => setTimeout(() => syncAll(false), 400));
  window.addEventListener("online", () => syncAll(false));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") syncAll(false);
  });

  init().catch((error) => {
    console.error(error);
    setStatus(error.message || "Cloud portal start nahi hua.", "error");
  });
})();
