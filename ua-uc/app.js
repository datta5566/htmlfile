const columns = [
  "SR/NO", "REPORTED BY ", "DATE", "TYPE", "LOCATION", "AREA",
  "HAZARDS TYPE", "OBSERVATION FOUND", "CORRECTIVE ACTION", "RESPONSIBLE",
  "STATUS", "REMARKS ", "TARGET DATE", "PHOTOS", "CLOSED PHOTO"
];

const messageMap = new Map([
  ["name", "REPORTED BY "], ["reported by", "REPORTED BY "], ["type", "TYPE"],
  ["location", "LOCATION"], ["area", "AREA"], ["hazard type", "HAZARDS TYPE"],
  ["hazards type", "HAZARDS TYPE"], ["hazard", "HAZARDS TYPE"],
  ["observation", "OBSERVATION FOUND"], ["observation found", "OBSERVATION FOUND"],
  ["correction action", "CORRECTIVE ACTION"], ["corrective action", "CORRECTIVE ACTION"],
  ["responsible", "RESPONSIBLE"], ["status", "STATUS"], ["remark", "REMARKS "],
  ["remarks", "REMARKS "], ["target date", "TARGET DATE"], ["photo", "PHOTOS"],
  ["photos", "PHOTOS"], ["closed photo", "CLOSED PHOTO"], ["closed photos", "CLOSED PHOTO"]
]);

const importAliases = {
  "SR/NO": ["sr no", "srno", "serial no", "serial number", "s no", "sl no", "no"],
  "REPORTED BY ": ["reported by", "report by", "reporter", "employee name", "name", "reported person", "observer", "inspector"],
  "DATE": ["date", "reported date", "observation date", "entry date"],
  "TYPE": ["type", "category", "ua uc", "ua uc type", "observation type", "unsafe type"],
  "LOCATION": ["location", "plant location", "place", "unit", "shop", "line"],
  "AREA": ["area", "department", "dept", "section", "work area"],
  "HAZARDS TYPE": ["hazards type", "hazard type", "hazard", "hazard category", "risk type"],
  "OBSERVATION FOUND": ["observation found", "observation", "unsafe observation", "description", "finding", "issue", "unsafe condition", "unsafe act"],
  "CORRECTIVE ACTION": ["corrective action", "correction action", "action taken", "action", "control action", "immediate action"],
  "RESPONSIBLE": ["responsible", "responsibility", "owner", "action owner", "responsible person", "assigned to"],
  "STATUS": ["status", "current status", "action status", "open close status"],
  "REMARKS ": ["remarks", "remark", "comments", "comment", "notes"],
  "TARGET DATE": ["target date", "due date", "completion date", "expected date", "closure date"],
  "PHOTOS": ["photos", "photo", "before photo", "image", "photo name"],
  "CLOSED PHOTO": ["closed photo", "closed photos", "after photo", "closure photo", "completed photo"]
};

const $ = selector => document.querySelector(selector);
let records = [];
let showingSaved = false;
let currentBatchSaved = false;
const savedKey = "whatsapp-safety-saved-records-online-v1";
const sessionKey = "whatsapp-safety-login-online-v1";

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

function splitMsgs(text) {
  const content = String(text || "").replace(/\r/g, "").trim();
  if (!content) return [];
  const starts = [...content.matchAll(/(?:^|\n)\s*1\s*[-.)]\s*name\s*:-?/gi)]
    .map(match => match.index + (match[0].startsWith("\n") ? 1 : 0));
  if (starts.length <= 1) return [content];
  return starts.map((start, index) => content.slice(start, starts[index + 1] ?? content.length).trim()).filter(Boolean);
}

function parseMsg(message, index) {
  const row = blank(index);
  const labels = [...message.matchAll(/(?:^|\n)[ \t]*\d+[ \t]*[-.)][ \t]*([^:\n]+?)[ \t]*:-?[ \t]*/g)];
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
  return list.map((row, index) => ({
    ...Object.fromEntries(columns.map(column => [column, row[column] ?? ""])),
    "SR/NO": index + 1
  }));
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
  if (!records.length) {
    $("#tbody").innerHTML = `<tr><td class="empty" colspan="${columns.length}">Preview will appear here after conversion.</td></tr>`;
    $("#rowCount").textContent = "No records yet.";
    return;
  }
  $("#tbody").innerHTML = records.map((row, rowIndex) =>
    "<tr>" + columns.map(column =>
      `<td contenteditable="true" data-row="${rowIndex}" data-col="${esc(column)}">${esc(row[column])}</td>`
    ).join("") + "</tr>"
  ).join("");
  $("#rowCount").textContent = `${records.length} row${records.length === 1 ? "" : "s"} ready.`;
}

function parseAll() {
  records = renum(splitMsgs($("#messageInput").value).map(parseMsg));
  showingSaved = false;
  currentBatchSaved = false;
  $("#importMeta").textContent = "";
  render();
  $("#downloadBtn").disabled = records.length === 0 && saved().length === 0;
  $("#status").textContent = records.length ? `${records.length} message record ready. Save dabao.` : "No valid WhatsApp message found.";
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

async function importExcel() {
  const file = $("#excelFile").files[0];
  if (!file) {
    $("#status").textContent = "Pehle Excel/CSV file choose karo.";
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

    let selected = null;
    for (const sheetName of workbook.SheetNames) {
      const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: true });
      const candidate = findHeaderRow(matrix);
      if (!selected || candidate.matches > selected.header.matches || (candidate.matches === selected.header.matches && matrix.length > selected.matrix.length)) {
        selected = { sheetName, matrix, header: candidate };
      }
    }
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
  const exportData = exportRows();
  if (!exportData.length) {
    $("#status").textContent = "No records available for Excel download.";
    return;
  }
  const data = exportData.map((row, index) => Object.fromEntries(columns.map(column => [column, column === "SR/NO" ? index + 1 : row[column] || ""])));
  const worksheet = XLSX.utils.json_to_sheet(data, { header: columns });
  XLSX.utils.sheet_add_aoa(worksheet, [["DAILY SAFETY OBSERVATION SHEET FOR UA/UC"]], { origin: "A1" });
  worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 14 } }];
  worksheet["!cols"] = columns.map(column => ({ wch: ["OBSERVATION FOUND", "CORRECTIVE ACTION"].includes(column) ? 38 : 17 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "UA UC");
  XLSX.writeFile(workbook, `ua-uc-nearmiss-saved-${fmt($("#defaultDate").value || todayIso())}.xlsx`);
  $("#status").textContent = `${exportData.length} records downloaded.`;
}

$("#defaultDate").value = todayIso();
if (sessionStorage.getItem(sessionKey) === "yes") document.body.classList.remove("lock");
$("#downloadBtn").disabled = saved().length === 0;
render();

$("#loginForm").addEventListener("submit", event => {
  event.preventDefault();
  if ($("#loginUser").value.trim() !== "Mr__Dk" || !/^[0-9]{5}$/.test($("#loginPin").value.trim())) {
    $("#loginError").textContent = "Invalid login. User ID Mr__Dk aur 5 digit PIN use karo.";
    return;
  }
  sessionStorage.setItem(sessionKey, "yes");
  document.body.classList.remove("lock");
  $("#loginPin").value = "";
  $("#loginError").textContent = "";
});

$("#convertBtn").onclick = parseAll;
$("#importBtn").onclick = importExcel;
$("#saveBtn").onclick = saveData;
$("#showBtn").onclick = showSaved;
$("#downloadBtn").onclick = downloadExcel;
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
