const columns = [
  "SR/NO", "NAME", "DATE", "TYPE", "LOCATION", "AREA",
  "HAZARDS TYPE", "OBSERVATION FOUND", "CORRECTIVE ACTION", "RESPONSIBLE",
  "STATUS", "REMARKS", "TARGET DATE", "PHOTOS", "CLOSED PHOTO"
];

const messageMap = new Map([
  ["name", "NAME"], ["reported by", "NAME"], ["type", "TYPE"],
  ["location", "LOCATION"], ["area", "AREA"], ["hazard type", "HAZARDS TYPE"],
  ["hazards type", "HAZARDS TYPE"], ["hazard", "HAZARDS TYPE"],
  ["observation", "OBSERVATION FOUND"], ["observation found", "OBSERVATION FOUND"],
  ["correction action", "CORRECTIVE ACTION"], ["corrective action", "CORRECTIVE ACTION"],
  ["responsible", "RESPONSIBLE"], ["status", "STATUS"], ["remark", "REMARKS"],
  ["remarks", "REMARKS"], ["target date", "TARGET DATE"], ["photo", "PHOTOS"],
  ["photos", "PHOTOS"], ["closed photo", "CLOSED PHOTO"], ["closed photos", "CLOSED PHOTO"]
]);

const importAliases = {
  "SR/NO": ["sr no", "srno", "serial no", "serial number", "s no", "sl no", "no"],
  "NAME": ["reported by", "report by", "reporter", "employee name", "name", "reported person", "observer", "inspector"],
  "DATE": ["date", "reported date", "observation date", "entry date"],
  "TYPE": ["type", "category", "ua uc", "ua uc type", "observation type", "unsafe type"],
  "LOCATION": ["location", "plant location", "place", "unit", "shop", "line"],
  "AREA": ["area", "department", "dept", "section", "work area"],
  "HAZARDS TYPE": ["hazards type", "hazard type", "hazard", "hazard category", "risk type"],
  "OBSERVATION FOUND": ["observation found", "observation", "unsafe observation", "description", "finding", "issue", "unsafe condition", "unsafe act"],
  "CORRECTIVE ACTION": ["corrective action", "correction action", "action taken", "action", "control action", "immediate action"],
  "RESPONSIBLE": ["responsible", "responsibility", "owner", "action owner", "responsible person", "assigned to"],
  "STATUS": ["status", "current status", "action status", "open close status"],
  "REMARKS": ["remarks", "remark", "comments", "comment", "notes"],
  "TARGET DATE": ["target date", "due date", "completion date", "expected date", "closure date"],
  "PHOTOS": ["photos", "photo", "before photo", "image", "photo name"],
  "CLOSED PHOTO": ["closed photo", "closed photos", "after photo", "closure photo", "completed photo"]
};

const $ = selector => document.querySelector(selector);
let records = [];
let showingSaved = false;
let currentBatchSaved = false;
let selectedType = "";
const savedKey = "whatsapp-safety-saved-records-online-v1";
const sessionKey = "whatsapp-safety-login-online-v1";
const sessionTimeKey = "whatsapp-safety-login-time-v1";
const loginAttemptKey = "whatsapp-safety-login-attempts-v1";
const sessionDuration = 30 * 60 * 1000;
const maxFileBytes = 10 * 1024 * 1024;
const mainFileDbName = "safety-main-excel-db-v1";
const mainFileStoreName = "handles";
const mainFileHandleKey = "main-excel";

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function fmt(value) {
  if (!value) return "";
  const parts = String(value).split("-");
  if (parts.length !== 3) return String(value);
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function clean(value) {
  return String(value ?? "").replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
}

function safeExcelValue(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
}

function canonicalType(value) {
  const type = normalized(value);
  if (type === "ua" || type.includes("unsafe act")) return "UA";
  if (type === "uc" || type.includes("unsafe condition")) return "UC";
  if (type === "near miss" || type === "nearmiss" || type.includes("near miss")) return "NEAR MISS";
  return String(value ?? "").trim().toUpperCase();
}

function filteredEntries(list = records) {
  return list
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !selectedType || canonicalType(row.TYPE) === selectedType);
}

function updateTypeButtons() {
  document.querySelectorAll("[data-type-filter]").forEach(button => {
    const type = button.dataset.typeFilter;
    const count = records.filter(row => canonicalType(row.TYPE) === type).length;
    button.classList.toggle("active", selectedType === type);
    button.setAttribute("aria-pressed", selectedType === type ? "true" : "false");
    button.textContent = `${type} (${count})`;
  });
}

function sessionValid() {
  const started = Number(sessionStorage.getItem(sessionTimeKey) || 0);
  return sessionStorage.getItem(sessionKey) === "yes" && started > 0 && Date.now() - started < sessionDuration;
}

function openMainFileDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(mainFileDbName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(mainFileStoreName)) {
        request.result.createObjectStore(mainFileStoreName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeMainFileHandle(handle) {
  const db = await openMainFileDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(mainFileStoreName, "readwrite");
    transaction.objectStore(mainFileStoreName).put(handle, mainFileHandleKey);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function getMainFileHandle() {
  const db = await openMainFileDb();
  const handle = await new Promise((resolve, reject) => {
    const request = db.transaction(mainFileStoreName, "readonly")
      .objectStore(mainFileStoreName).get(mainFileHandleKey);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return handle;
}

function logout(message = "") {
  sessionStorage.removeItem(sessionKey);
  sessionStorage.removeItem(sessionTimeKey);
  document.body.classList.add("lock");
  $("#loginPin").value = "";
  $("#loginError").textContent = message;
}

function normalized(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[_/\\.-]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function blank(index) {
  const row = Object.fromEntries(columns.map(column => [column, ""]));
  row["SR/NO"] = index + 1;
  row.DATE = fmt($("#defaultDate").value);
  return row;
}

function normalizeBulkText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(
      /\[[^\]\n]{5,60}\]\s*[^:\n]{1,80}:\s*(?=(?:1\s*[-.)]\s*)?(?:name|reported by)\s*:-?)/gi,
      "\n"
    )
    .replace(
      /(?:^|\n)\s*\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}[^\n]{0,35}[-–]\s*[^:\n]{1,80}:\s*(?=(?:1\s*[-.)]\s*)?(?:name|reported by)\s*:-?)/gi,
      "\n"
    )
    .replace(
      /([^\n])[\t ]+(?=1\s*[-.)]\s*(?:name|reported by)\s*:-?)/gi,
      "$1\n"
    )
    .trim();
}

function splitMsgs(text) {
  const content = normalizeBulkText(text);
  if (!content) return [];
  const starts = [...content.matchAll(/(?:^|\n)[ \t]*(?:1[ \t]*[-.)][ \t]*)?(?:name|reported by)[ \t]*:-?/gi)]
    .map(match => match.index + (match[0].startsWith("\n") ? 1 : 0));
  if (starts.length <= 1) return [content];
  return starts.map((start, index) => content.slice(start, starts[index + 1] ?? content.length).trim()).filter(Boolean);
}

function parseMsg(message, index) {
  const row = blank(index);
  const labels = [...message.matchAll(/(?:^|\n)[ \t]*(?:\d+[ \t]*[-.)][ \t]*)?([a-z][^:\n]{0,40}?)[ \t]*:-?[ \t]*/gi)];
  labels.forEach((match, labelIndex) => {
    const sourceKey = normalized(match[1]);
    let column = messageMap.get(sourceKey);
    if (!column) {
      for (const [alias, mappedColumn] of [...messageMap.entries()].sort((a, b) => b[0].length - a[0].length)) {
        if (sourceKey.includes(alias)) { column = mappedColumn; break; }
      }
    }
    if (!column) return;
    const start = match.index + match[0].length;
    const end = labels[labelIndex + 1]?.index ?? message.length;
    row[column] = clean(message.slice(start, end));
  });
  return row;
}

function renum(list) {
  return list.map((row, index) => {
    const normalizedRow = Object.fromEntries(columns.map(column => [column, row[column] ?? ""]));
    normalizedRow.NAME = row.NAME ?? row["REPORTED BY "] ?? row["REPORTED BY"] ?? "";
    normalizedRow.REMARKS = row.REMARKS ?? row["REMARKS "] ?? "";
    normalizedRow["SR/NO"] = index + 1;
    return normalizedRow;
  });
}

function saved() {
  try {
    const value = JSON.parse(localStorage.getItem(savedKey) || "[]");
    return Array.isArray(value) ? renum(value) : [];
  } catch {
    return [];
  }
}

function saveList(list) {
  localStorage.setItem(savedKey, JSON.stringify(renum(list)));
}

function render() {
  $("#thead").innerHTML = "<tr>" + columns.map(column => `<th>${esc(column)}</th>`).join("") + "</tr>";
  updateTypeButtons();
  if (!records.length) {
    $("#tbody").innerHTML = `<tr><td class="empty" colspan="${columns.length}">Preview will appear here after conversion.</td></tr>`;
    $("#rowCount").textContent = "No records yet.";
    return;
  }
  const visible = filteredEntries();
  if (!visible.length) {
    $("#tbody").innerHTML = `<tr><td class="empty" colspan="${columns.length}">No ${esc(selectedType)} records found.</td></tr>`;
    $("#rowCount").textContent = `0 ${selectedType} records. Click the active button again to show all.`;
    return;
  }
  $("#tbody").innerHTML = visible.map(({ row, index: rowIndex }) =>
    "<tr>" + columns.map(column =>
      `<td contenteditable="true" data-row="${rowIndex}" data-col="${esc(column)}">${esc(row[column])}</td>`
    ).join("") + "</tr>"
  ).join("");
  $("#rowCount").textContent = selectedType
    ? `${visible.length} ${selectedType} record${visible.length === 1 ? "" : "s"} ready for preview/download.`
    : `${records.length} row${records.length === 1 ? "" : "s"} ready.`;
}

function parseAll() {
  const messages = splitMsgs($("#messageInput").value);
  const parsed = messages.map(parseMsg);
  const valid = parsed.filter(row =>
    clean(row.NAME) !== "" ||
    clean(row.TYPE) !== "" ||
    clean(row["OBSERVATION FOUND"]) !== ""
  );
  records = renum(valid);
  showingSaved = false;
  currentBatchSaved = false;
  $("#importMeta").textContent = "";
  render();
  $("#downloadBtn").disabled = records.length === 0 && saved().length === 0;
  const skipped = messages.length - valid.length;
  $("#status").textContent = records.length
    ? `${records.length} WhatsApp records ready${skipped ? `; ${skipped} empty/invalid message skipped` : ""}. Check preview, then Save dabao.`
    : "No valid WhatsApp messages found. Make sure every message contains Name, Type, or Observation.";
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function convertWithAnimation() {
  const button = $("#convertBtn");
  const label = button.querySelector("span");
  button.disabled = true;
  button.classList.add("is-loading");
  label.textContent = "Converting messages...";
  $("#status").textContent = "WhatsApp messages process ho rahe hain...";
  await wait(900);
  parseAll();
  button.classList.remove("is-loading");
  button.disabled = false;
  label.textContent = "Convert All Messages";
  document.querySelector(".table").classList.remove("just-updated");
  $("#status").classList.remove("status-flash");
  requestAnimationFrame(() => {
    document.querySelector(".table").classList.add("just-updated");
    $("#status").classList.add("status-flash");
  });
}

function headerToColumn(header) {
  const value = normalized(header);
  if (!value) return null;
  for (const column of columns) {
    if (normalized(column) === value) return column;
  }
  for (const [column, aliases] of Object.entries(importAliases)) {
    if (aliases.some(alias => value === normalized(alias))) return column;
  }
  for (const [column, aliases] of Object.entries(importAliases)) {
    if (aliases.some(alias => {
      const candidate = normalized(alias);
      return candidate.length >= 5 && (value.includes(candidate) || candidate.includes(value));
    })) return column;
  }
  return null;
}

function dateValue(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getDate()).padStart(2, "0")}-${String(value.getMonth() + 1).padStart(2, "0")}-${value.getFullYear()}`;
  }
  if (typeof value === "number" && typeof XLSX !== "undefined") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${String(parsed.d).padStart(2, "0")}-${String(parsed.m).padStart(2, "0")}-${parsed.y}`;
  }
  const text = clean(value);
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[3].padStart(2, "0")}-${iso[2].padStart(2, "0")}-${iso[1]}`;
  const local = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (local) return `${local[1].padStart(2, "0")}-${local[2].padStart(2, "0")}-${local[3].length === 2 ? "20" + local[3] : local[3]}`;
  return text;
}

function recordFingerprint(row) {
  return [
    row.NAME, row.DATE, row.TYPE, row.LOCATION, row.AREA,
    row["OBSERVATION FOUND"], row["CORRECTIVE ACTION"]
  ].map(value => normalized(value)).join("|");
}

function findHeaderRow(matrix) {
  let best = { index: -1, matches: 0, populated: 0 };
  matrix.slice(0, 25).forEach((row, index) => {
    const mapped = new Set(row.map(headerToColumn).filter(Boolean));
    const populated = row.filter(cell => clean(cell) !== "").length;
    if (mapped.size > best.matches || (mapped.size === best.matches && populated > best.populated)) {
      best = { index, matches: mapped.size, populated };
    }
  });
  if (best.matches >= 2) return best;
  const fallback = matrix.slice(0, 25).findIndex(row => row.filter(cell => clean(cell) !== "").length >= 2);
  return { index: fallback, matches: 0, populated: fallback >= 0 ? matrix[fallback].filter(cell => clean(cell) !== "").length : 0 };
}

function chooseWorkbookSheet(workbook) {
  let selected = null;
  for (const sheetName of workbook.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1, defval: "", raw: true
    });
    const header = findHeaderRow(matrix);
    if (
      !selected ||
      header.matches > selected.header.matches ||
      (header.matches === selected.header.matches && matrix.length > selected.matrix.length)
    ) {
      selected = { sheetName, matrix, header };
    }
  }
  return selected;
}

async function mergeRecordsIntoWorkbook(file) {
  if (file.size > 50 * 1024 * 1024) throw new Error("Main Excel file 50 MB se badi hai.");
  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true, cellStyles: true });
  const selected = chooseWorkbookSheet(workbook);
  if (!selected || selected.header.index < 0 || selected.header.matches < 2) {
    throw new Error("Main file me matching header row nahi mili.");
  }

  const headers = selected.matrix[selected.header.index].map(clean);
  const mapping = headers.map(headerToColumn);
  const existingFingerprints = new Set();
  selected.matrix.slice(selected.header.index + 1).forEach(sourceRow => {
    const existing = Object.fromEntries(columns.map(column => [column, ""]));
    sourceRow.forEach((value, index) => {
      const column = mapping[index];
      if (column) existing[column] = clean(value);
    });
    const fingerprint = recordFingerprint(existing);
    if (fingerprint.replace(/\|/g, "")) existingFingerprints.add(fingerprint);
  });

  const rowsToAdd = [];
  let duplicateCount = 0;
  records.forEach(record => {
    const fingerprint = recordFingerprint(record);
    if (existingFingerprints.has(fingerprint)) {
      duplicateCount += 1;
      return;
    }
    existingFingerprints.add(fingerprint);
    rowsToAdd.push(headers.map((_, index) => {
      const column = mapping[index];
      if (!column || column === "SR/NO") return "";
      return safeExcelValue(record[column] || "");
    }));
  });

  const serialIndex = mapping.indexOf("SR/NO");
  let existingDataRows = 0;
  let lastDataRowIndex = selected.header.index;
  selected.matrix.slice(selected.header.index + 1).forEach((row, offset) => {
    const hasRecordData = row.some((cell, index) => {
      const column = mapping[index];
      return column && column !== "SR/NO" && clean(cell) !== "";
    });
    if (hasRecordData) {
      existingDataRows += 1;
      lastDataRowIndex = selected.header.index + 1 + offset;
    }
  });
  rowsToAdd.forEach((row, index) => {
    if (serialIndex >= 0) row[serialIndex] = existingDataRows + index + 1;
  });
  if (rowsToAdd.length) {
    XLSX.utils.sheet_add_aoa(
      workbook.Sheets[selected.sheetName],
      rowsToAdd,
      { origin: { r: lastDataRowIndex + 1, c: 0 } }
    );
  }
  return {
    workbook,
    addedCount: rowsToAdd.length,
    duplicateCount,
    sheetName: selected.sheetName,
    firstSavedRow: lastDataRowIndex + 2,
    bookType: file.name.toLowerCase().endsWith(".xls") ? "xls" : "xlsx"
  };
}

async function updateMainExcel() {
  if (!records.length) {
    $("#status").textContent = "Pehle WhatsApp messages ya Excel file ko preview me convert karo.";
    return;
  }
  if (typeof XLSX === "undefined") {
    $("#status").textContent = "Excel engine load nahi hua. Internet connection check karo.";
    return;
  }
  if (!window.showOpenFilePicker) {
    $("#status").textContent = "Main Excel file choose karo. Updated copy same data ke saath download hogi.";
    $("#mainExcelFallback").value = "";
    $("#mainExcelFallback").click();
    return;
  }

  $("#updateMainBtn").disabled = true;
  $("#status").textContent = "Main Excel file select karo. File Microsoft Excel me open ho to pehle close kar do.";
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [{
        description: "Main Excel Workbook",
        accept: {
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
          "application/vnd.ms-excel": [".xls"]
        }
      }]
    });
    const file = await handle.getFile();
    const result = await mergeRecordsIntoWorkbook(file);
    if (!result.addedCount) {
      $("#status").textContent = `Koi new record nahi mila. ${result.duplicateCount} duplicate record main file me pehle se hai.`;
      return;
    }
    const output = XLSX.write(result.workbook, {
      bookType: result.bookType, type: "array", cellStyles: true
    });
    const writable = await handle.createWritable();
    await writable.write(output);
    await writable.close();
    $("#status").textContent = `${result.addedCount} records ${file.name} ki ${result.sheetName} sheet me row ${result.firstSavedRow} se save hue${result.duplicateCount ? `; ${result.duplicateCount} duplicates skipped` : ""}.`;
  } catch (error) {
    if (error?.name === "AbortError") $("#status").textContent = "Main Excel file selection cancel hui.";
    else $("#status").textContent = `Main Excel update failed: ${error.message} File Excel me open ho to close karke retry karein.`;
  } finally {
    $("#updateMainBtn").disabled = false;
  }
}

async function updateMainExcelFallback() {
  const file = $("#mainExcelFallback").files[0];
  if (!file) return;
  if (!records.length) {
    $("#status").textContent = "Pehle WhatsApp messages ko Convert All Messages se preview me lao, phir main file choose karo.";
    $("#mainExcelFallback").value = "";
    return;
  }
  if (typeof XLSX === "undefined") {
    $("#status").textContent = "Excel engine load nahi hua. Internet connection check karo.";
    $("#mainExcelFallback").value = "";
    return;
  }
  $("#status").textContent = "Main Excel file update ho rahi hai...";
  try {
    const result = await mergeRecordsIntoWorkbook(file);
    if (!result.addedCount) {
      $("#status").textContent = `Koi new record nahi mila. ${result.duplicateCount} duplicates pehle se hain.`;
      return;
    }
    XLSX.writeFile(
      result.workbook,
      `UPDATED-${file.name}`,
      { bookType: result.bookType, cellStyles: true }
    );
    $("#status").textContent = `${result.addedCount} records ${result.sheetName} sheet me header ke niche row ${result.firstSavedRow} se add hue. UPDATED-${file.name} download hui.`;
  } catch (error) {
    $("#status").textContent = `Main Excel update failed: ${error.message}`;
  } finally {
    $("#mainExcelFallback").value = "";
  }
}

async function connectMainExcel() {
  if (!window.showOpenFilePicker) return;
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [{
        description: "Main Excel Workbook",
        accept: {
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
          "application/vnd.ms-excel": [".xls"]
        }
      }]
    });
    const permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error("Read/write permission nahi mili.");
    const file = await handle.getFile();
    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(bytes, { type: "array", cellDates: true, cellStyles: true });
    const selected = chooseWorkbookSheet(workbook);
    if (!selected || selected.header.index < 0 || selected.header.matches < 2) {
      throw new Error("Selected file me required headers nahi mile.");
    }
    await storeMainFileHandle(handle);
    $("#mainFileState").textContent = `Connected: ${file.name}. Ab Save Directly button isi file ko update karega.`;
    $("#status").textContent = `${file.name} Main Excel ke roop me connect ho gayi.`;
  } catch (error) {
    if (error?.name === "AbortError") $("#status").textContent = "Main Excel connection cancel hui.";
    else $("#status").textContent = `Main Excel connect nahi hui: ${error.message}`;
  }
}

async function saveDirectlyToMainExcel() {
  if (!records.length) {
    $("#status").textContent = "Pehle messages convert karke preview me records lao.";
    return;
  }
  $("#saveDirectBtn").disabled = true;
  try {
    const handle = await getMainFileHandle();
    if (!handle) {
      $("#status").textContent = "Pehle Connect Main Excel — One Time button se file connect karo.";
      return;
    }
    let permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error("Main file ki read/write permission nahi mili.");

    const file = await handle.getFile();
    const result = await mergeRecordsIntoWorkbook(file);
    if (!result.addedCount) {
      $("#status").textContent = `Koi new record nahi mila. ${result.duplicateCount} duplicate records pehle se hain.`;
      return;
    }
    const output = XLSX.write(result.workbook, {
      bookType: result.bookType, type: "array", cellStyles: true
    });
    const writable = await handle.createWritable();
    await writable.write(output);
    await writable.close();
    $("#mainFileState").textContent = `Connected: ${file.name}`;
    $("#status").textContent = `${result.addedCount} records directly ${file.name} ki ${result.sheetName} sheet me row ${result.firstSavedRow} se save hue.`;
  } catch (error) {
    $("#status").textContent = `Direct save failed: ${error.message} Excel file open ho to close karke retry karo.`;
  } finally {
    $("#saveDirectBtn").disabled = false;
  }
}

async function refreshMainFileState() {
  if (!window.showOpenFilePicker) {
    document.body.classList.add("no-direct-file");
    return;
  }
  try {
    const handle = await getMainFileHandle();
    if (!handle) return;
    const permission = await handle.queryPermission({ mode: "readwrite" });
    $("#mainFileState").textContent = permission === "granted"
      ? `Connected: ${handle.name}`
      : `Saved connection: ${handle.name}. Save करते समय permission allow करें.`;
  } catch {
    $("#mainFileState").textContent = "Main Excel is not connected yet.";
  }
}

async function importExcel() {
  const file = $("#excelFile").files[0];
  if (!file) {
    $("#status").textContent = "Pehle Excel/CSV file choose karo.";
    return;
  }
  const extension = file.name.split(".").pop().toLowerCase();
  if (!["xlsx", "xls", "csv"].includes(extension)) {
    $("#status").textContent = "Only .xlsx, .xls, or .csv files are allowed.";
    $("#excelFile").value = "";
    return;
  }
  if (file.size > maxFileBytes) {
    $("#status").textContent = "File is too large. Maximum allowed size is 10 MB.";
    $("#excelFile").value = "";
    return;
  }
  if (typeof XLSX === "undefined") {
    alert("Internet ON karo, Excel engine load nahi hua.");
    return;
  }

  $("#importBtn").disabled = true;
  $("#status").textContent = "Excel file read ho rahi hai...";
  try {
    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
    if (!workbook.SheetNames.length) throw new Error("Workbook me sheet nahi mili.");

    const selected = chooseWorkbookSheet(workbook);
    if (!selected || selected.header.index < 0) throw new Error("Excel me header/data row nahi mili.");

    const headers = selected.matrix[selected.header.index].map(clean);
    let mapping = headers.map(headerToColumn);
    const nonEmptyHeaders = headers.filter(Boolean).length;
    if (mapping.filter(Boolean).length < 2 && nonEmptyHeaders >= columns.length - 1) {
      mapping = headers.map((_, index) => columns[index] || null);
    }

    const matchedColumns = [...new Set(mapping.filter(Boolean))];
    if (!matchedColumns.length) {
      throw new Error("Column names match nahi hue. Reported By, Date, Type, Location, Area, Observation jaise headers use karein.");
    }

    const converted = [];
    let skipped = 0;
    selected.matrix.slice(selected.header.index + 1).forEach(sourceRow => {
      const hasData = sourceRow.some(cell => clean(cell) !== "");
      if (!hasData) { skipped += 1; return; }
      const target = blank(converted.length);
      sourceRow.forEach((value, index) => {
        const column = mapping[index];
        if (!column || column === "SR/NO") return;
        target[column] = column === "DATE" || column === "TARGET DATE" ? dateValue(value) : clean(value);
      });
      const meaningful = columns.filter(column => column !== "SR/NO").some(column => clean(target[column]) !== "");
      if (meaningful) converted.push(target); else skipped += 1;
    });

    records = renum(converted);
    showingSaved = false;
    currentBatchSaved = false;
    $("#messageInput").value = "";
    render();
    $("#downloadBtn").disabled = records.length === 0 && saved().length === 0;
    $("#importMeta").textContent = `File: ${file.name} | Sheet: ${selected.sheetName} | Header row: ${selected.header.index + 1} | Matched: ${matchedColumns.length}/${columns.length} columns | Skipped blank rows: ${skipped}`;
    $("#status").textContent = records.length ? `${records.length} Excel rows preview me convert hui. Check karke Save dabao.` : "File read hui, lekin data rows nahi mili.";
  } catch (error) {
    records = [];
    render();
    $("#importMeta").textContent = "";
    $("#status").textContent = `Excel import failed: ${error.message}`;
  } finally {
    $("#importBtn").disabled = false;
  }
}

function saveData() {
  if ($("#messageInput").value.trim()) parseAll();
  else if (!records.length || showingSaved) {
    $("#status").textContent = showingSaved ? "Saved records already shown." : "Message convert ya Excel import karne ke baad Save dabao.";
    return;
  }
  if (!records.length) return;
  records = renum([...saved(), ...records]);
  saveList(records);
  showingSaved = true;
  currentBatchSaved = true;
  $("#messageInput").value = "";
  $("#excelFile").value = "";
  $("#downloadBtn").disabled = false;
  render();
  $("#status").textContent = `${records.length} saved records shown.`;
}

function showSaved() {
  records = saved();
  showingSaved = true;
  currentBatchSaved = true;
  $("#downloadBtn").disabled = records.length === 0;
  render();
  $("#status").textContent = records.length ? `${records.length} saved records shown.` : "No saved records yet.";
}

function exportRows() {
  const savedRows = saved();
  if (showingSaved) return savedRows;
  if (!records.length) return savedRows;
  if (currentBatchSaved) return savedRows.length ? savedRows : records;
  return renum([...savedRows, ...records]);
}

function downloadExcel() {
  if (typeof XLSX === "undefined") {
    alert("Internet ON karo, Excel engine load nahi hua.");
    return;
  }
  const allExportData = exportRows();
  const exportData = selectedType
    ? allExportData.filter(row => canonicalType(row.TYPE) === selectedType)
    : allExportData;
  if (!exportData.length) {
    $("#status").textContent = selectedType
      ? `No ${selectedType} records available for Excel download.`
      : "No records available for Excel download.";
    return;
  }
  const data = exportData.map((row, index) => Object.fromEntries(columns.map(column => [
    column,
    column === "SR/NO" ? index + 1 : safeExcelValue(row[column] || "")
  ])));
  const worksheet = XLSX.utils.json_to_sheet(data, { header: columns });
  const reportTitle = selectedType
    ? `DAILY SAFETY OBSERVATION SHEET FOR ${selectedType}`
    : "DAILY SAFETY OBSERVATION SHEET FOR UA/UC/NEAR MISS";
  XLSX.utils.sheet_add_aoa(worksheet, [[reportTitle]], { origin: "A1" });
  worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 14 } }];
  worksheet["!cols"] = columns.map(column => ({ wch: ["OBSERVATION FOUND", "CORRECTIVE ACTION"].includes(column) ? 38 : 17 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, selectedType || "ALL RECORDS");
  const typePart = selectedType ? `-${selectedType.toLowerCase().replace(/\s+/g, "-")}` : "";
  XLSX.writeFile(workbook, `ua-uc-nearmiss${typePart}-${fmt($("#defaultDate").value || todayIso())}.xlsx`);
  $("#status").textContent = selectedType
    ? `${exportData.length} ${selectedType} records downloaded.`
    : `${exportData.length} records downloaded.`;
}

$("#defaultDate").value = todayIso();
if (sessionValid()) document.body.classList.remove("lock");
else logout("");
$("#downloadBtn").disabled = saved().length === 0;
render();

$("#loginForm").addEventListener("submit", event => {
  event.preventDefault();
  const attempt = JSON.parse(sessionStorage.getItem(loginAttemptKey) || '{"count":0,"blockedUntil":0}');
  if (Date.now() < attempt.blockedUntil) {
    const seconds = Math.ceil((attempt.blockedUntil - Date.now()) / 1000);
    $("#loginError").textContent = `Too many attempts. Try again in ${seconds} seconds.`;
    return;
  }
  if ($("#loginUser").value.trim() !== "Mr__Dk" || !/^[0-9]{5}$/.test($("#loginPin").value.trim())) {
    const count = attempt.count + 1;
    const blockedUntil = count >= 5 ? Date.now() + 30000 : 0;
    sessionStorage.setItem(loginAttemptKey, JSON.stringify({ count: blockedUntil ? 0 : count, blockedUntil }));
    $("#loginError").textContent = blockedUntil
      ? "Too many attempts. Login is locked for 30 seconds."
      : `Invalid login. ${5 - count} attempt${5 - count === 1 ? "" : "s"} remaining.`;
    return;
  }
  sessionStorage.removeItem(loginAttemptKey);
  sessionStorage.setItem(sessionKey, "yes");
  sessionStorage.setItem(sessionTimeKey, String(Date.now()));
  document.body.classList.remove("lock");
  $("#loginPin").value = "";
  $("#loginError").textContent = "";
});

$("#logoutBtn").onclick = () => logout("You have logged out safely.");
setInterval(() => {
  if (!document.body.classList.contains("lock") && !sessionValid()) {
    logout("Session expired after 30 minutes. Please log in again.");
  }
}, 60000);

$("#convertBtn").onclick = convertWithAnimation;
$("#importBtn").onclick = importExcel;
$("#connectMainBtn").onclick = connectMainExcel;
$("#saveDirectBtn").onclick = saveDirectlyToMainExcel;
$("#mainExcelFallback").onchange = updateMainExcelFallback;
$("#saveBtn").onclick = saveData;
$("#showBtn").onclick = showSaved;
$("#downloadBtn").onclick = downloadExcel;
document.querySelectorAll("[data-type-filter]").forEach(button => {
  button.onclick = () => {
    const type = button.dataset.typeFilter;
    selectedType = selectedType === type ? "" : type;
    render();
    $("#status").textContent = selectedType
      ? `${selectedType} filter selected. Download Excel will export only ${selectedType} records.`
      : "Type filter cleared. All records are shown and ready for download.";
  };
});
$("#deleteBtn").onclick = () => {
  if (confirm("Saved data delete karna hai?")) {
    localStorage.removeItem(savedKey);
    records = [];
    showingSaved = false;
    currentBatchSaved = false;
    $("#downloadBtn").disabled = true;
    render();
    $("#status").textContent = "Saved records deleted.";
  }
};
$("#clearBtn").onclick = () => {
  $("#messageInput").value = "";
  $("#excelFile").value = "";
  $("#importMeta").textContent = "";
  records = [];
  showingSaved = false;
  currentBatchSaved = false;
  selectedType = "";
  $("#downloadBtn").disabled = saved().length === 0;
  render();
  $("#status").textContent = "Ready for WhatsApp text or Excel file.";
};
$("#tbody").addEventListener("input", event => {
  const cell = event.target.closest("td[contenteditable=true]");
  if (!cell) return;
  const rowIndex = Number(cell.dataset.row);
  const column = cell.dataset.col;
  if (records[rowIndex] && column) {
    records[rowIndex][column] = cell.textContent.trim();
    if (showingSaved) saveList(records);
  }
});
refreshMainFileState();

document.querySelectorAll(".btn, .type-btn").forEach(control => {
  control.addEventListener("pointerdown", () => {
    control.classList.remove("is-tapped");
    requestAnimationFrame(() => control.classList.add("is-tapped"));
  });
  control.addEventListener("animationend", event => {
    if (event.animationName === "buttonTap") control.classList.remove("is-tapped");
  });
});

const loginShell = document.querySelector(".login-shell");
if (loginShell && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  loginShell.addEventListener("pointermove", event => {
    const box = loginShell.getBoundingClientRect();
    const rotateY = ((event.clientX - box.left) / box.width - 0.5) * 4;
    const rotateX = ((event.clientY - box.top) / box.height - 0.5) * -3;
    loginShell.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  });
  loginShell.addEventListener("pointerleave", () => {
    loginShell.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg)";
  });
}
