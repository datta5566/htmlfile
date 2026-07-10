(() => {
  "use strict";

  const config = window.DK_CLOUD_CONFIG || {};
  const $ = (selector) => document.querySelector(selector);
  let cloudDb = null;
  let currentUser = null;
  let snapshots = [];
  let rows = [];

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
      const haystack = JSON.stringify({
        email: row.profile.email,
        name: row.profile.display_name,
        app: row.snapshot.app_code,
        record: row.record
      }).toLowerCase();
      return haystack.includes(term);
    });
  }

  function renderFilters() {
    const apps = [...new Set(snapshots.map((item) => item.app_code))].sort();
    $("#appFilter").innerHTML = '<option value="">All Apps</option>' + apps.map((app) => `<option value="${esc(app)}">${esc(app)}</option>`).join("");

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
    const userCount = new Set(snapshots.map((item) => item.user_id)).size;
    const appCount = new Set(snapshots.map((item) => item.app_code)).size;
    $("#userCount").textContent = userCount;
    $("#appCount").textContent = appCount;
    $("#snapshotCount").textContent = snapshots.length;
    $("#recordCount").textContent = rows.length;
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

  async function verifyAdmin(session) {
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
    $("#adminUser").textContent = data.email || currentUser.email;
    $("#loginPanel").hidden = true;
    $("#dashboard").hidden = false;
    await fetchAllSnapshots();
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
    downloadText(JSON.stringify(snapshots, null, 2), "dk-all-users-data.json", "application/json");
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
  }

  $("#adminLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("#adminEmail").value.trim();
    const password = $("#adminPassword").value;
    const { data, error } = await cloudDb.auth.signInWithPassword({ email, password });
    if (error) $("#loginMessage").textContent = error.message;
    else await verifyAdmin(data.session);
  });

  $("#refreshBtn").addEventListener("click", () => fetchAllSnapshots().catch((error) => {
    $("#dashboardStatus").textContent = error.message;
  }));
  $("#logoutBtn").addEventListener("click", async () => {
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
