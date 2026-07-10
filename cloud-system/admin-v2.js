(() => {
  "use strict";

  const config = window.DK_CLOUD_CONFIG || {};
  const $ = (selector) => document.querySelector(selector);
  let cloudDb = null;
  let currentUser = null;
  let pendingAdminEmail = "";
  let snapshots = [];
  let rows = [];
  let notifications = [];
  let notificationChannel = null;
  let adminActive = false;

  function configured() {
    return Boolean(
      config.supabaseUrl &&
      config.supabasePublishableKey &&
      !String(config.supabaseUrl).startsWith("PASTE_") &&
      !String(config.supabasePublishableKey).startsWith("PASTE_")
    );
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function recordSummary(record) {
    if (!record || typeof record !== "object") return String(record ?? "");
    const fields = [
      record.complaintNo,
      record.employeeName,
      record["REPORTED BY "],
      record.ideaBy,
      record.barcode,
      record["Part Barcode"],
      record.partName,
      record["OBSERVATION FOUND"],
      record.rejection,
      record.unit,
      record.kn,
      record.shift
    ].filter(Boolean);
    return fields.slice(0, 5).join(" | ") || "Record";
  }

  function flattenSnapshots() {
    rows = [];
    for (const snapshot of snapshots) {
      const profile = snapshot.profiles || {};
      const list = Array.isArray(snapshot.payload) ? snapshot.payload : [snapshot.payload];
      if (!list.length) {
        rows.push({ snapshot, profile, record: {}, index: 0 });
        continue;
      }
      list.forEach((record, index) => rows.push({ snapshot, profile, record, index }));
    }
  }

  function filteredRows() {
    const term = $("#searchBox").value.trim().toLowerCase();
    const app = $("#appFilter").value;
    const user = $("#userFilter").value;
    return rows.filter((row) => {
      if (app && row.snapshot.app_code !== app) return false;
      if (user && row.snapshot.user_id !== user) return false;
      if (!term) return true;
      return JSON.stringify({
        email: row.profile.email,
        name: row.profile.display_name,
        app: row.snapshot.app_code,
        record: row.record
      }).toLowerCase().includes(term);
    });
  }

  function renderFilters() {
    const apps = [...new Set(snapshots.map((item) => item.app_code))].sort();
    $("#appFilter").innerHTML = '<option value="">All Apps</option>' + apps
      .map((app) => `<option value="${esc(app)}">${esc(app)}</option>`)
      .join("");

    const users = new Map();
    snapshots.forEach((item) => {
      users.set(item.user_id, item.profiles?.display_name || item.profiles?.email || item.user_id);
    });
    $("#userFilter").innerHTML = '<option value="">All Users</option>' + [...users.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`)
      .join("");
  }

  function renderStats() {
    $("#userCount").textContent = new Set(snapshots.map((item) => item.user_id)).size;
    $("#appCount").textContent = new Set(snapshots.map((item) => item.app_code)).size;
    $("#snapshotCount").textContent = snapshots.length;
    $("#recordCount").textContent = rows.length;
    $("#unreadCount").textContent = notifications.filter((item) => !item.is_read).length;
  }

  function renderTable() {
    const data = filteredRows();
    const tbody = $("#recordsBody");
    $("#visibleCount").textContent = `${data.length} records shown`;

    if (!data.length) {
      tbody.innerHTML = '<tr><td class="empty" colspan="9">No matching records.</td></tr>';
      return;
    }

    tbody.innerHTML = data.slice(0, 3000).map((row, visibleIndex) => {
      const filePath = row.record?.cloudFilePath;
      const updated = row.snapshot.client_updated_at || row.snapshot.updated_at;
      const email = row.profile.email || row.snapshot.user_id;
      const name = row.profile.display_name || "-";
      return `
        <tr>
          <td>${visibleIndex + 1}</td>
          <td><strong>${esc(name)}</strong><br>${esc(email)}</td>
          <td><span class="badge">${esc(row.snapshot.app_code)}</span></td>
          <td>${esc(row.snapshot.device_id.slice(0, 12))}</td>
          <td>${esc(row.snapshot.storage_key)}</td>
          <td>${esc(new Date(updated).toLocaleString("en-IN"))}</td>
          <td>${esc(recordSummary(row.record))}</td>
          <td><button class="btn secondary view-json" type="button" data-row-id="${esc(`${row.snapshot.id}:${row.index}`)}">View</button></td>
          <td>${filePath ? `<button class="btn download-file" type="button" data-path="${esc(filePath)}">Download</button>` : "-"}</td>
        </tr>`;
    }).join("");

    tbody.querySelectorAll(".view-json").forEach((button) => {
      button.addEventListener("click", () => showJson(button.dataset.rowId));
    });
    tbody.querySelectorAll(".download-file").forEach((button) => {
      button.addEventListener("click", () => downloadCloudFile(button.dataset.path));
    });
  }

  function showJson(rowId) {
    const [snapshotId, indexText] = rowId.split(":");
    const row = rows.find((item) => item.snapshot.id === snapshotId && item.index === Number(indexText));
    if (!row) return;
    $("#jsonContent").textContent = JSON.stringify({
      user: row.profile,
      app: row.snapshot.app_code,
      device_id: row.snapshot.device_id,
      storage_key: row.snapshot.storage_key,
      updated_at: row.snapshot.client_updated_at || row.snapshot.updated_at,
      record: row.record
    }, null, 2);
    $("#jsonModal").hidden = false;
  }

  async function downloadCloudFile(path) {
    const { data, error } = await cloudDb.storage
      .from(config.storageBucket || "dk-app-files")
      .download(path);
    if (error) {
      $("#dashboardStatus").textContent = error.message;
      return;
    }
    const url = URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = url;
    link.download = path.split("/").pop() || "download";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function fetchAllSnapshots() {
    $("#dashboardStatus").textContent = "Loading all users data...";
    const output = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
      const { data, error } = await cloudDb
        .from("app_snapshots")
        .select("*,profiles!app_snapshots_user_id_fkey(email,display_name,role)")
        .order("updated_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      output.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    snapshots = output;
    flattenSnapshots();
    renderFilters();
    renderStats();
    renderTable();
    $("#dashboardStatus").textContent = `Updated: ${new Date().toLocaleString("en-IN")}`;
  }

  function renderNotifications() {
    const unread = notifications.filter((item) => !item.is_read).length;
    $("#notificationBadge").textContent = unread;
    $("#unreadCount").textContent = unread;
    const host = $("#notificationList");

    if (!notifications.length) {
      host.innerHTML = '<p class="empty">No notifications yet.</p>';
      return;
    }

    host.innerHTML = notifications.slice(0, 100).map((item) => {
      const profile = item.profiles || {};
      const user = profile.display_name || profile.email || item.user_id;
      return `
        <article class="notification-item ${item.is_read ? "read" : "unread"}">
          <div class="notification-title">
            <strong>${esc(item.title)}</strong>
            <span class="badge">${esc(item.app_code)}</span>
          </div>
          <p>${esc(item.message)}</p>
          <small>${esc(user)} · ${esc(new Date(item.created_at).toLocaleString("en-IN"))}</small>
          ${item.is_read ? "" : `<button class="btn secondary mark-read" type="button" data-id="${esc(item.id)}">Mark read</button>`}
        </article>`;
    }).join("");

    host.querySelectorAll(".mark-read").forEach((button) => {
      button.addEventListener("click", () => markNotificationRead(button.dataset.id));
    });
  }

  async function fetchNotifications() {
    const { data, error } = await cloudDb
      .from("admin_notifications")
      .select("*,profiles!admin_notifications_user_id_fkey(email,display_name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    notifications = data || [];
    renderNotifications();
    renderStats();
  }

  async function markNotificationRead(id) {
    const { error } = await cloudDb
      .from("admin_notifications")
      .update({ is_read: true })
      .eq("id", id);
    if (error) {
      $("#dashboardStatus").textContent = error.message;
      return;
    }
    await fetchNotifications();
  }

  async function markAllRead() {
    const { error } = await cloudDb
      .from("admin_notifications")
      .update({ is_read: true })
      .eq("is_read", false);
    if (error) {
      $("#dashboardStatus").textContent = error.message;
      return;
    }
    await fetchNotifications();
  }

  function showBrowserAlert(notification) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    new Notification(notification.title || "DK App Alert", {
      body: `${notification.app_code || "App"}: ${notification.message || "New record"}`
    });
  }

  async function enableBrowserAlerts() {
    if (!("Notification" in window)) {
      $("#dashboardStatus").textContent = "Browser notifications are not supported.";
      return;
    }
    const permission = await Notification.requestPermission();
    $("#dashboardStatus").textContent = permission === "granted"
      ? "Browser notifications enabled."
      : "Browser notification permission not granted.";
  }

  function startNotificationStream() {
    if (notificationChannel) cloudDb.removeChannel(notificationChannel);
    notificationChannel = cloudDb
      .channel("dk-admin-notifications")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "admin_notifications"
      }, async (change) => {
        showBrowserAlert(change.new);
        await fetchNotifications();
        await fetchAllSnapshots();
      })
      .subscribe();
  }

  async function verifyAdmin(session) {
    if (!session?.user || (adminActive && currentUser?.id === session.user.id)) return;
    currentUser = session.user;
    const { data, error } = await cloudDb
      .from("profiles")
      .select("email,display_name,role")
      .eq("id", currentUser.id)
      .single();
    if (error) throw error;
    if (data.role !== "admin") {
      $("#loginMessage").textContent = "This account is not an administrator.";
      await cloudDb.auth.signOut();
      return;
    }

    adminActive = true;
    $("#adminUser").textContent = data.email || currentUser.email;
    $("#loginPanel").hidden = true;
    $("#dashboard").hidden = false;
    await Promise.all([fetchAllSnapshots(), fetchNotifications()]);
    startNotificationStream();
  }

  function resetAdminOtp() {
    pendingAdminEmail = "";
    $("#adminOtpRequestForm").hidden = false;
    $("#adminOtpVerifyForm").hidden = true;
    $("#adminOtpCode").value = "";
  }

  function csvEscape(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function exportCsv() {
    const data = filteredRows();
    const headers = ["User Name","User Email","App","Device","Storage Key","Updated","Record JSON"];
    const lines = [headers.map(csvEscape).join(",")];
    data.forEach((row) => {
      lines.push([
        row.profile.display_name,
        row.profile.email,
        row.snapshot.app_code,
        row.snapshot.device_id,
        row.snapshot.storage_key,
        row.snapshot.client_updated_at || row.snapshot.updated_at,
        JSON.stringify(row.record)
      ].map(csvEscape).join(","));
    });
    downloadText(lines.join("\n"), "dk-all-users-data.csv", "text/csv;charset=utf-8");
  }

  function exportJson() {
    downloadText(JSON.stringify({ snapshots, notifications }, null, 2), "dk-all-users-data.json", "application/json");
  }

  function downloadText(text, fileName, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function init() {
    if (!configured()) {
      $("#loginMessage").textContent = "Cloud configuration pending in supabase-config.js.";
      return;
    }

    cloudDb = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    const { data } = await cloudDb.auth.getSession();
    if (data.session) await verifyAdmin(data.session);

    cloudDb.auth.onAuthStateChange((_event, session) => {
      if (session) verifyAdmin(session).catch((error) => {
        $("#loginMessage").textContent = error.message;
      });
      if (!session) {
        adminActive = false;
        currentUser = null;
      }
    });
  }

  $("#adminOtpRequestForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("#adminEmail").value.trim().toLowerCase();
    $("#loginMessage").textContent = "OTP bheja ja raha hai...";
    const { error } = await cloudDb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false }
    });
    if (error) {
      $("#loginMessage").textContent = error.message;
      return;
    }
    pendingAdminEmail = email;
    $("#adminOtpEmailLabel").textContent = email;
    $("#adminOtpRequestForm").hidden = true;
    $("#adminOtpVerifyForm").hidden = false;
    $("#loginMessage").textContent = "Email par aaya 6-digit OTP enter karein.";
    $("#adminOtpCode").focus();
  });

  $("#adminOtpVerifyForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = $("#adminOtpCode").value.trim();
    if (!pendingAdminEmail || !/^\d{6}$/.test(token)) {
      $("#loginMessage").textContent = "Valid 6-digit OTP enter karein.";
      return;
    }
    $("#loginMessage").textContent = "OTP verify ho raha hai...";
    const { data, error } = await cloudDb.auth.verifyOtp({
      email: pendingAdminEmail,
      token,
      type: "email"
    });
    if (error) {
      $("#loginMessage").textContent = error.message;
      return;
    }
    if (data.session) await verifyAdmin(data.session);
  });

  $("#adminChangeEmailBtn").addEventListener("click", resetAdminOtp);
  $("#refreshBtn").addEventListener("click", async () => {
    try {
      await Promise.all([fetchAllSnapshots(), fetchNotifications()]);
    } catch (error) {
      $("#dashboardStatus").textContent = error.message;
    }
  });
  $("#markAllReadBtn").addEventListener("click", markAllRead);
  $("#enableBrowserAlertsBtn").addEventListener("click", enableBrowserAlerts);
  $("#logoutBtn").addEventListener("click", async () => {
    if (notificationChannel) await cloudDb.removeChannel(notificationChannel);
    await cloudDb.auth.signOut();
    location.reload();
  });
  $("#exportCsvBtn").addEventListener("click", exportCsv);
  $("#exportJsonBtn").addEventListener("click", exportJson);
  $("#searchBox").addEventListener("input", renderTable);
  $("#appFilter").addEventListener("change", renderTable);
  $("#userFilter").addEventListener("change", renderTable);
  $("#closeModalBtn").addEventListener("click", () => $("#jsonModal").hidden = true);
  $("#jsonModal").addEventListener("click", (event) => {
    if (event.target.id === "jsonModal") $("#jsonModal").hidden = true;
  });

  init().catch((error) => {
    console.error(error);
    $("#loginMessage").textContent = error.message || "Admin dashboard failed to start.";
  });
})();
