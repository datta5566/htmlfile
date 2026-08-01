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
      name: "Safety UA/UC & Near Miss",
      url: "../index.html",
      keys: ["whatsapp-safety-saved-records-online-v1"]
    },
    kaizen: {
      name: "Kaizen Converter",
      url: "../kaizen/",
      keys: ["kaizen_converter_records_v8_combined_v2", "dk_kaizen_online_records_v4"]
    },
    rejection: {
      name: "Rejection Management",
      url: "../Rejection_Management_System_V2_Ultra_Professional.html",
      keys: ["rejection_records_v2", "rejection_records"]
    },
    file_store: {
      name: "File Store Pro",
      url: "../../cl-new-/",
      keys: ["FILE_STORE_PRO_RECORDS_V2"]
    },
    complaint_trace: {
      name: "Customer Complaint Traceability",
      url: "../../cl-new-/#complaintPanel",
      keys: ["FILE_STORE_PRO_COMPLAINTS_V1"]
    },
    pdi_scanner: {
      name: "DK PDI Scanner",
      url: "../DK_PDI_Android/app/src/main/assets/index.html",
      keys: ["dk_pdi_android_reports_v1"]
    },
    video_studio: {
      name: "AI Short Video Studio",
      url: "../AI_Short_Video_Studio/",
      keys: ["dk_video_preset", "dk_last_prompt"]
    }
  });

  let cloudDb = null;
  let currentUser = null;
  let snapshots = [];
  let rows = [];
  let notifications = [];
  let dataChannel = null;
  let alertChannel = null;
  let syncTimer = null;
  let syncBusy = false;
  let activeTool = "ua_uc";

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[char]));
  }

  function configured() {
    return Boolean(config.supabaseUrl && config.supabasePublishableKey && window.supabase);
  }

  function toolName(code) {
    return TOOLS[code]?.name || code || "Tool";
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
    try {
      return JSON.parse(raw);
    } catch {
      return { value: raw };
    }
  }

  function listFromPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object") return [payload];
    if (payload !== null && payload !== undefined && payload !== "") return [{ value: payload }];
    return [];
  }

  function itemCount(payload) {
    if (Array.isArray(payload)) return payload.length;
    if (payload && typeof payload === "object") return 1;
    return payload ? 1 : 0;
  }

  function recordSummary(record) {
    if (!record || typeof record !== "object") return String(record ?? "");
    const fields = [
      record.complaintNo, record.employeeName, record["REPORTED BY "], record.ideaBy,
      record.barcode, record["Part Barcode"], record.partName, record["OBSERVATION FOUND"],
      record.rejection, record.unit, record.kn, record.shift, record.topic, record.value
    ].filter(Boolean);
    return fields.slice(0, 5).join(" | ") || "Saved record";
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
    return String(value || "uploaded-file")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 120);
  }

  async function uploadDataUrl(dataUrl, record, appCode, deviceId) {
    const signature = await sha256(`${dataUrl.length}:${dataUrl.slice(0, 160)}`);
    const cacheKey = `DK_ADMIN_FILE_${currentUser.id}_${signature}`;
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

  async function syncEvents(appCode, storageKey, originalPayload, cloudPayload, deviceId) {
    const baselineKey = `${BASELINE_PREFIX}${currentUser.id}_${appCode}_${storageKey}`;
    const isBaseline = localStorage.getItem(baselineKey) !== "1";
    const originals = listFromPayload(originalPayload);
    const clouds = listFromPayload(cloudPayload);
    const events = [];

    for (let index = 0; index < originals.length; index += 1) {
      const original = originals[index];
      const recordHash = await sha256(JSON.stringify(recordForHash(original)));
      events.push({
        user_id: currentUser.id,
        app_code: appCode,
        device_id: deviceId,
        storage_key: storageKey,
        record_hash: recordHash,
        record_index: index,
        record_data: clouds[index] ?? original,
        notify_admin: !isBaseline
      });
    }

    if (events.length) {
      const { error } = await cloudDb.from("app_events").upsert(events, {
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
    const sameData = localStorage.getItem(cacheKey) === fingerprint;
    const needsBaseline = localStorage.getItem(baselineKey) !== "1";
    if (!force && sameData && !needsBaseline) return { changed: false, count: itemCount(safeJson(raw)) };

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

    await syncEvents(appCode, storageKey, originalPayload, cloudPayload, deviceId);
    localStorage.setItem(cacheKey, fingerprint);
    return { changed: !sameData, count: itemCount(originalPayload) };
  }

  async function syncAll(force = false) {
    if (!currentUser || syncBusy) return;
    syncBusy = true;
    $("#toolStatus").textContent = "Cloud sync chal raha hai...";
    let total = 0;
    let changed = 0;
    const errors = [];

    try {
      for (const [appCode, tool] of Object.entries(TOOLS)) {
        for (const key of tool.keys) {
          try {
            const result = await syncOne(appCode, key, force);
            total += result.count;
            if (result.changed) changed += 1;
          } catch (error) {
            errors.push(`${tool.name}: ${error.message || "sync failed"}`);
          }
        }
      }

      if (errors.length) {
        $("#toolStatus").textContent = `${errors.length} section sync error.`;
        $("#dashboardStatus").textContent = errors.join(" | ");
      } else {
        $("#toolStatus").textContent = `Cloud safe: ${total} records · ${changed} updated`;
      }
    } finally {
      syncBusy = false;
    }
  }

  function flattenSnapshots() {
    rows = [];
    for (const snapshot of snapshots) {
      const list = listFromPayload(snapshot.payload);
      if (!list.length) continue;
      list.forEach((record, index) => rows.push({
        id: `${snapshot.id}:${index}`,
        snapshot_id: snapshot.id,
        user_id: snapshot.user_id,
        display_name: snapshot.profiles?.display_name || snapshot.profiles?.email || "Owner",
        app_code: snapshot.app_code,
        storage_key: snapshot.storage_key,
        device_id: snapshot.device_id,
        updated_at: snapshot.updated_at,
        record_data: record,
        record_index: index
      }));
    }
  }

  function filteredRows() {
    const term = $("#searchBox").value.trim().toLowerCase();
    const app = $("#appFilter").value;
    const user = $("#userFilter").value;
    return rows.filter((row) =>
      (!app || row.app_code === app) &&
      (!user || row.user_id === user) &&
      (!term || JSON.stringify(row).toLowerCase().includes(term))
    );
  }

  function renderToolButtons() {
    const host = $("#toolButtons");
    host.innerHTML = "";
    for (const [code, tool] of Object.entries(TOOLS)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "project-tool";
      button.dataset.toolCode = code;
      button.innerHTML = `<strong>${esc(tool.name)}</strong><small>${esc(tool.keys.length)} data section${tool.keys.length > 1 ? "s" : ""}</small>`;
      button.onclick = () => openTool(code);
      host.appendChild(button);
    }
  }

  function openTool(code) {
    activeTool = code;
    const tool = TOOLS[code];
    $("#activeToolName").textContent = tool.name;
    $("#toolFrame").src = tool.url;
    document.querySelectorAll(".project-tool").forEach((button) => {
      button.classList.toggle("active", button.dataset.toolCode === code);
    });
    setTimeout(() => syncAll(false).catch(() => {}), 1200);
  }

  function renderFilters() {
    const appValue = $("#appFilter").value;
    const userValue = $("#userFilter").value;
    $("#appFilter").innerHTML = '<option value="">All Tools</option>' +
      Object.entries(TOOLS).map(([code, tool]) => `<option value="${esc(code)}">${esc(tool.name)}</option>`).join("");
    const users = new Map(snapshots.map((row) => [row.user_id, row.profiles?.display_name || row.profiles?.email || "Owner"]));
    $("#userFilter").innerHTML = '<option value="">All Owners / Users</option>' +
      [...users].map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join("");
    $("#appFilter").value = appValue;
    $("#userFilter").value = userValue;
  }

  function renderStats() {
    $("#userCount").textContent = new Set(snapshots.map((row) => row.user_id)).size;
    $("#appCount").textContent = Object.keys(TOOLS).length;
    $("#recordCount").textContent = rows.length;
    const unread = notifications.filter((row) => !row.is_read).length;
    $("#unreadCount").textContent = unread;
    $("#notificationBadge").textContent = unread;
  }

  function showJson(id) {
    const row = rows.find((item) => item.id === id);
    if (!row) return;
    $("#jsonContent").textContent = JSON.stringify(row.record_data, null, 2);
    $("#jsonModal").hidden = false;
  }

  async function downloadCloudFile(id) {
    const row = rows.find((item) => item.id === id);
    const path = row?.record_data?.cloudFilePath;
    if (!path) return;
    const { data, error } = await cloudDb.storage
      .from(config.storageBucket || "dk-app-files")
      .createSignedUrl(path, 60);
    if (error) {
      $("#dashboardStatus").textContent = error.message;
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  function renderTable() {
    const visible = filteredRows();
    $("#visibleCount").textContent = `${visible.length} records shown`;
    $("#recordsBody").innerHTML = visible.length ? visible.map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${esc(toolName(row.app_code))}</td>
        <td>${esc(row.storage_key)}</td>
        <td>${esc(new Date(row.updated_at).toLocaleString("en-IN"))}</td>
        <td>${esc(recordSummary(row.record_data))}</td>
        <td><button class="btn secondary view-json" data-id="${esc(row.id)}">View</button></td>
        <td>${row.record_data?.cloudFilePath ? `<button class="btn download-file" data-id="${esc(row.id)}">Download</button>` : "-"}</td>
      </tr>`).join("") :
      '<tr><td class="empty" colspan="7">Is filter me abhi saved data nahi hai.</td></tr>';

    document.querySelectorAll(".view-json").forEach((button) => button.onclick = () => showJson(button.dataset.id));
    document.querySelectorAll(".download-file").forEach((button) => button.onclick = () => downloadCloudFile(button.dataset.id));
  }

  function renderNotifications() {
    $("#notificationList").innerHTML = notifications.length ? notifications.slice(0, 100).map((row) => `
      <article class="notification-item ${row.is_read ? "" : "unread"}">
        <div class="notification-title"><strong>${esc(toolName(row.app_code))}</strong><span class="badge">${row.is_read ? "Read" : "New"}</span></div>
        <p>${esc(row.message || recordSummary(row.record_data))}</p>
        <small>${esc(new Date(row.created_at).toLocaleString("en-IN"))}</small>
      </article>`).join("") : '<p class="empty">No new tool submissions yet.</p>';
  }

  async function fetchSnapshots() {
    const output = [];
    let from = 0;
    while (true) {
      const { data, error } = await cloudDb
        .from("app_snapshots")
        .select("*,profiles(display_name,email)")
        .order("updated_at", { ascending: false })
        .range(from, from + 999);
      if (error) throw error;
      output.push(...data);
      if (data.length < 1000) break;
      from += 1000;
    }
    snapshots = output;
    flattenSnapshots();
  }

  async function fetchNotifications() {
    const { data, error } = await cloudDb
      .from("admin_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    notifications = data || [];
  }

  async function fetchAll(syncFirst = false) {
    $("#dashboardStatus").textContent = "Loading...";
    if (syncFirst) await syncAll(false);
    await Promise.all([fetchSnapshots(), fetchNotifications()]);
    renderFilters();
    renderStats();
    renderTable();
    renderNotifications();
    $("#dashboardStatus").textContent = `Updated: ${new Date().toLocaleString("en-IN")}`;
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
    const visible = filteredRows();
    const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const lines = [["Tool", "Storage Section", "Updated", "Record JSON"].map(quote).join(",")];
    visible.forEach((row) => lines.push([
      toolName(row.app_code), row.storage_key, row.updated_at, JSON.stringify(row.record_data)
    ].map(quote).join(",")));
    download(lines.join("\n"), "dk-admin-tool-data.csv", "text/csv;charset=utf-8");
  }

  async function verifyAdmin(session) {
    currentUser = session.user;
    const { data, error } = await cloudDb
      .from("profiles")
      .select("email,display_name,role")
      .eq("id", currentUser.id)
      .single();

    if (error || data?.role !== "admin") {
      $("#loginMessage").textContent = "यह account Administrator नहीं है।";
      await cloudDb.auth.signOut();
      return;
    }

    $("#adminUser").textContent = data.email || currentUser.email;
    $("#loginPanel").hidden = true;
    $("#dashboard").hidden = false;
    renderToolButtons();
    openTool(activeTool);
    await syncAll(true);
    await fetchAll(false);

    clearInterval(syncTimer);
    syncTimer = setInterval(() => {
      syncAll(false).then(() => fetchAll(false)).catch((error) => {
        $("#dashboardStatus").textContent = error.message || "Auto sync error";
      });
    }, Math.max(10000, Number(config.syncIntervalMs) || 15000));

    if (dataChannel) await cloudDb.removeChannel(dataChannel);
    if (alertChannel) await cloudDb.removeChannel(alertChannel);

    dataChannel = cloudDb.channel("dk-admin-snapshots")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_snapshots" }, () => {
        fetchAll(false).catch(() => {});
      }).subscribe();

    alertChannel = cloudDb.channel("dk-admin-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_notifications" }, async (change) => {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(`New ${toolName(change.new.app_code)} Record`, { body: change.new.message || "New record saved" });
        }
        await fetchAll(false);
      }).subscribe();
  }

  async function init() {
    renderToolButtons();
    if (!configured()) {
      $("#loginMessage").textContent = "Cloud configuration pending.";
      return;
    }

    cloudDb = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

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
      if (session && !currentUser) {
        verifyAdmin(session).catch((error) => $("#loginMessage").textContent = error.message);
      }
      if (!session) currentUser = null;
    });
  }

  $("#adminPasswordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const adminId = $("#adminId").value.trim().toLowerCase();
    const password = $("#adminPassword").value;
    if (adminId !== ADMIN_ID) {
      $("#loginMessage").textContent = "Admin ID गलत है।";
      return;
    }

    const adminEmail = localStorage.getItem(ADMIN_EMAIL_KEY);
    if (!adminEmail) {
      $("#loginMessage").textContent = "पहली बार Setup Admin Password दबाएं।";
      return;
    }

    $("#loginMessage").textContent = "Login हो रहा है...";
    const { data, error } = await cloudDb.auth.signInWithPassword({ email: adminEmail, password });
    if (error) {
      $("#loginMessage").textContent = "Password गलत है या Admin account setup बाकी है।";
      return;
    }
    if (data.session) await verifyAdmin(data.session);
  });

  $("#showSetupBtn").onclick = () => {
    $("#adminPasswordForm").hidden = true;
    $("#adminSetupForm").hidden = false;
    $("#setupAdminEmail").value = localStorage.getItem(ADMIN_EMAIL_KEY) || "";
    $("#setupAdminEmail").focus();
  };

  $("#cancelSetupBtn").onclick = () => {
    $("#adminSetupForm").hidden = true;
    $("#adminPasswordForm").hidden = false;
  };

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
    const password = $("#newAdminPassword").value;
    const { data, error } = await cloudDb.auth.updateUser({ password });
    if (error) {
      $("#loginMessage").textContent = error.message;
      return;
    }
    if (data.user?.email) localStorage.setItem(ADMIN_EMAIL_KEY, data.user.email.toLowerCase());
    $("#loginMessage").textContent = "Password save हो गया। अब admin ID से login करें।";
    await cloudDb.auth.signOut();
    location.reload();
  });

  $("#refreshBtn").onclick = () => syncAll(true)
    .then(() => fetchAll(false))
    .catch((error) => $("#dashboardStatus").textContent = error.message);

  $("#markAllReadBtn").onclick = async () => {
    const { error } = await cloudDb.from("admin_notifications").update({ is_read: true }).eq("is_read", false);
    if (error) {
      $("#dashboardStatus").textContent = error.message;
      return;
    }
    await fetchAll(false);
  };

  $("#enableBrowserAlertsBtn").onclick = async () => {
    if ("Notification" in window) await Notification.requestPermission();
  };

  $("#logoutBtn").onclick = async () => {
    clearInterval(syncTimer);
    if (dataChannel) await cloudDb.removeChannel(dataChannel);
    if (alertChannel) await cloudDb.removeChannel(alertChannel);
    await syncAll(true);
    await cloudDb.auth.signOut();
    location.reload();
  };

  $("#exportCsvBtn").onclick = exportCsv;
  $("#exportJsonBtn").onclick = () => download(JSON.stringify(rows, null, 2), "dk-admin-tool-data.json", "application/json");
  $("#searchBox").oninput = renderTable;
  $("#appFilter").onchange = renderTable;
  $("#userFilter").onchange = renderTable;
  $("#closeModalBtn").onclick = () => $("#jsonModal").hidden = true;
  $("#jsonModal").onclick = (event) => {
    if (event.target.id === "jsonModal") $("#jsonModal").hidden = true;
  };
  $("#toolFrame").addEventListener("load", () => setTimeout(() => {
    syncAll(false).then(() => fetchAll(false)).catch(() => {});
  }, 900));
  window.addEventListener("storage", () => setTimeout(() => {
    syncAll(false).then(() => fetchAll(false)).catch(() => {});
  }, 300));
  window.addEventListener("online", () => {
    syncAll(true).then(() => fetchAll(false)).catch(() => {});
  });

  init().catch((error) => $("#loginMessage").textContent = error.message || "Dashboard start नहीं हुआ।");
})();