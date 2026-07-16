(() => {
  "use strict";
  const config = window.DK_CLOUD_CONFIG || {};
  const $ = (selector) => document.querySelector(selector);
  let cloudDb = null;
  let currentUser = null;
  let submissions = [];
  let channel = null;
  const READ_KEY = "DK_ADMIN_LAST_READ_AT";

  function esc(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char])); }
  function configured() { return Boolean(config.supabaseUrl && config.supabasePublishableKey && window.supabase); }
  function summary(record) {
    if (!record || typeof record !== "object") return String(record ?? "");
    return [record.employeeName, record["REPORTED BY "], record.ideaBy, record.barcode, record["Part Barcode"], record.partName, record["OBSERVATION FOUND"], record.rejection, record.unit, record.kn, record.shift].filter(Boolean).slice(0, 5).join(" | ") || "Record";
  }
  function unreadRows() {
    const last = new Date(localStorage.getItem(READ_KEY) || 0).getTime();
    return submissions.filter((row) => new Date(row.created_at).getTime() > last);
  }
  function filtered() {
    const term = $("#searchBox").value.trim().toLowerCase();
    const app = $("#appFilter").value;
    const user = $("#userFilter").value;
    return submissions.filter((row) => (!app || row.app_code === app) && (!user || row.device_id === user) && (!term || JSON.stringify(row).toLowerCase().includes(term)));
  }
  function renderFilters() {
    const appValue = $("#appFilter").value;
    const userValue = $("#userFilter").value;
    const apps = [...new Set(submissions.map((row) => row.app_code))].sort();
    $("#appFilter").innerHTML = '<option value="">All Apps</option>' + apps.map((app) => `<option value="${esc(app)}">${esc(app)}</option>`).join("");
    const users = new Map(submissions.map((row) => [row.device_id, row.display_name || row.device_id]));
    $("#userFilter").innerHTML = '<option value="">All Users</option>' + [...users].map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join("");
    $("#appFilter").value = appValue;
    $("#userFilter").value = userValue;
  }
  function renderStats() {
    const unread = unreadRows().length;
    $("#userCount").textContent = new Set(submissions.map((row) => row.device_id)).size;
    $("#appCount").textContent = new Set(submissions.map((row) => row.app_code)).size;
    $("#recordCount").textContent = submissions.length;
    $("#unreadCount").textContent = unread;
    $("#notificationBadge").textContent = unread;
  }
  function showJson(id) {
    const row = submissions.find((item) => item.id === id);
    if (!row) return;
    $("#jsonContent").textContent = JSON.stringify(row.record_data, null, 2);
    $("#jsonModal").hidden = false;
  }
  async function downloadCloudFile(id) {
    const row = submissions.find((item) => item.id === id);
    const path = row?.record_data?.cloudFilePath;
    if (!path) return;
    const { data, error } = await cloudDb.storage.from("dk-public-files").createSignedUrl(path, 60);
    if (error) { $("#dashboardStatus").textContent = error.message; return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }
  function renderTable() {
    const rows = filtered();
    $("#visibleCount").textContent = `${rows.length} records shown`;
    $("#recordsBody").innerHTML = rows.length ? rows.map((row, index) => `<tr><td>${index + 1}</td><td>${esc(row.display_name || "User")}</td><td>${esc(row.app_code)}</td><td>${esc(row.device_id.slice(0, 12))}</td><td>${esc(new Date(row.created_at).toLocaleString("en-IN"))}</td><td>${esc(summary(row.record_data))}</td><td><button class="btn secondary view-json" data-id="${esc(row.id)}">View</button></td><td>${row.record_data?.cloudFilePath ? `<button class="btn download-file" data-id="${esc(row.id)}">Download</button>` : "-"}</td></tr>`).join("") : '<tr><td class="empty" colspan="8">No matching records.</td></tr>';
    document.querySelectorAll(".view-json").forEach((button) => button.onclick = () => showJson(button.dataset.id));
    document.querySelectorAll(".download-file").forEach((button) => button.onclick = () => downloadCloudFile(button.dataset.id));
  }
  function renderNotifications() {
    const rows = submissions.slice(0, 100);
    $("#notificationList").innerHTML = rows.length ? rows.map((row) => `<article class="notification-item"><div class="notification-title"><strong>${esc(row.display_name || "User")}</strong><span class="badge">${esc(row.app_code)}</span></div><p>${esc(summary(row.record_data))}</p><small>${esc(new Date(row.created_at).toLocaleString("en-IN"))}</small></article>`).join("") : '<p class="empty">No submissions yet.</p>';
  }
  async function fetchAll() {
    $("#dashboardStatus").textContent = "Loading...";
    const output = [];
    let from = 0;
    while (true) {
      const { data, error } = await cloudDb.from("public_submissions").select("*").order("created_at", { ascending: false }).range(from, from + 999);
      if (error) throw error;
      output.push(...data);
      if (data.length < 1000) break;
      from += 1000;
    }
    submissions = output;
    renderFilters(); renderStats(); renderTable(); renderNotifications();
    $("#dashboardStatus").textContent = `Updated: ${new Date().toLocaleString("en-IN")}`;
  }
  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement("a"); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportCsv() {
    const rows = filtered();
    const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const lines = [["User","App","Device","Submitted","Record JSON"].map(quote).join(",")];
    rows.forEach((row) => lines.push([row.display_name,row.app_code,row.device_id,row.created_at,JSON.stringify(row.record_data)].map(quote).join(",")));
    download(lines.join("\n"), "dk-user-data.csv", "text/csv;charset=utf-8");
  }
  async function verifyAdmin(session) {
    currentUser = session.user;
    const { data, error } = await cloudDb.from("profiles").select("email,display_name,role").eq("id", currentUser.id).single();
    if (error || data?.role !== "admin") {
      $("#loginMessage").textContent = "यह account Administrator नहीं है।";
      await cloudDb.auth.signOut();
      return;
    }
    $("#adminUser").textContent = data.email || currentUser.email;
    $("#loginPanel").hidden = true;
    $("#dashboard").hidden = false;
    await fetchAll();
    if (channel) await cloudDb.removeChannel(channel);
    channel = cloudDb.channel("dk-public-submissions").on("postgres_changes", { event: "INSERT", schema: "public", table: "public_submissions" }, async (change) => {
      if ("Notification" in window && Notification.permission === "granted") new Notification("New DK App Record", { body: `${change.new.display_name || "User"} · ${change.new.app_code}` });
      await fetchAll();
    }).subscribe();
  }
  async function init() {
    if (!configured()) { $("#loginMessage").textContent = "Cloud configuration pending."; return; }
    cloudDb = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const { data } = await cloudDb.auth.getSession();
    if (data.session) await verifyAdmin(data.session);
    cloudDb.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") { $("#adminPasswordForm").hidden = true; $("#newPasswordForm").hidden = false; $("#loginMessage").textContent = "नया password बनाएं।"; return; }
      if (session && !currentUser) verifyAdmin(session).catch((error) => $("#loginMessage").textContent = error.message);
      if (!session) currentUser = null;
    });
  }
  $("#adminPasswordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("#adminEmail").value.trim().toLowerCase();
    const password = $("#adminPassword").value;
    $("#loginMessage").textContent = "Login हो रहा है...";
    const { data, error } = await cloudDb.auth.signInWithPassword({ email, password });
    if (error) { $("#loginMessage").textContent = "Email या password गलत है।"; return; }
    if (data.session) await verifyAdmin(data.session);
  });
  $("#resetPasswordBtn").onclick = async () => {
    const email = $("#adminEmail").value.trim().toLowerCase();
    if (!email) { $("#loginMessage").textContent = "पहले Admin Email लिखें।"; return; }
    const { error } = await cloudDb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0] });
    $("#loginMessage").textContent = error ? error.message : "Password बनाने का link email पर भेजा गया है।";
  };
  $("#newPasswordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = $("#newAdminPassword").value;
    const { error } = await cloudDb.auth.updateUser({ password });
    if (error) { $("#loginMessage").textContent = error.message; return; }
    $("#loginMessage").textContent = "Password save हो गया।";
    location.reload();
  });
  $("#refreshBtn").onclick = () => fetchAll().catch((error) => $("#dashboardStatus").textContent = error.message);
  $("#markAllReadBtn").onclick = () => { localStorage.setItem(READ_KEY, new Date().toISOString()); renderStats(); };
  $("#enableBrowserAlertsBtn").onclick = async () => { if ("Notification" in window) await Notification.requestPermission(); };
  $("#logoutBtn").onclick = async () => { if (channel) await cloudDb.removeChannel(channel); await cloudDb.auth.signOut(); location.reload(); };
  $("#exportCsvBtn").onclick = exportCsv;
  $("#exportJsonBtn").onclick = () => download(JSON.stringify(submissions, null, 2), "dk-user-data.json", "application/json");
  $("#searchBox").oninput = renderTable; $("#appFilter").onchange = renderTable; $("#userFilter").onchange = renderTable;
  $("#closeModalBtn").onclick = () => $("#jsonModal").hidden = true;
  $("#jsonModal").onclick = (event) => { if (event.target.id === "jsonModal") $("#jsonModal").hidden = true; };
  init().catch((error) => $("#loginMessage").textContent = error.message || "Dashboard start नहीं हुआ।");
})();
