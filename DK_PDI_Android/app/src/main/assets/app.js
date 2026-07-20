(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'dk_pdi_android_reports_v2';
  const LEGACY_KEY = 'dk_pdi_android_reports_v1';

  const rows = [
    { id: 'sticker', sr: 1, name: 'Presence of correct sticker', spec: 'Must be available', method: 'Visual', kind: 'auto' },
    { id: 'ipo', sr: 2, name: 'IPO', spec: 'As per Sticker', method: 'Visual', kind: 'auto' },
    { id: 'part', sr: 3, name: 'Part Description', spec: 'Part name; ( ) content ignored', method: 'Visual', kind: 'auto' },
    { id: 'barcode', sr: 4, name: 'Barcode Number', spec: 'As per Sticker', method: 'Visual', kind: 'auto' },
    { id: 'length', sr: 5, name: 'Length', spec: 'Sticker length (+0 / -1 mm)', method: 'Measuring tape', kind: 'target', tolerance: 1 },
    { id: 'width', sr: 6, name: 'Width', spec: 'Sticker width (+0 / -1 mm)', method: 'Measuring tape', kind: 'target', tolerance: 1 },
    { id: 'diagonal', sr: 7, name: 'Diagonal', spec: '√(Width² + Length²) (+0 / -2 mm)', method: 'Formula / Tape', kind: 'diagonal', tolerance: 2 },
    { id: 'holeDiameter', sr: 8, name: 'Hole Diameter', spec: '16.50 to 16.75 mm', method: 'Vernier Calliper', kind: 'range', min: 16.5, max: 16.75 },
    { id: 'holePositionLength', sr: 9, name: 'Hole Position along Length', spec: 'As per drawing ±0.5 mm', method: 'Vernier Calliper', kind: 'text' },
    { id: 'holeBottom', sr: 10, name: 'From concrete face to hole Bottom', spec: '31.75 to 32.00 mm', method: 'Vernier Calliper', kind: 'range', min: 31.75, max: 32 },
    { id: 'millingDepth', sr: 11, name: 'Milling Depth', spec: '1.80 to 2.20 mm', method: 'Depth Gauge', kind: 'range', min: 1.8, max: 2.2 },
    { id: 'millingWidth', sr: 12, name: 'Milling Width', spec: '39.00 to 42.00 mm', method: 'Vernier Calliper', kind: 'range', min: 39, max: 42 },
    { id: 'stiffenerType', sr: 13, name: 'Type of stiffener', spec: 'As per drawing', method: 'Visual', kind: 'text' },
    { id: 'stiffenerPosition', sr: 14, name: 'Stiffener Position', spec: 'As per drawing', method: 'Measuring Tape', kind: 'text' },
    { id: 'stiffenerCount', sr: 15, name: 'No. of Stiffener', spec: 'As per drawing', method: 'Manual', kind: 'text' },
    { id: 'weldingPattern', sr: 16, name: 'Welding Pattern', spec: 'As per drawing', method: 'Measuring Tape', kind: 'text' },
    { id: 'stickerVisual', sr: 17, name: 'Sticker damage / partial pasted / not readable', spec: 'Not Allowed', method: 'Visual', kind: 'visual' },
    { id: 'punchingVisual', sr: '', name: 'Punching defects', spec: 'Not Allowed', method: 'Visual', kind: 'visual' },
    { id: 'millingVisual', sr: '', name: 'Milling missing / burr / rough finish', spec: 'Not Allowed', method: 'Visual', kind: 'visual' },
    { id: 'weldingVisual', sr: '', name: 'Welding spatter / crack / porosity / undercut', spec: 'Not Allowed', method: 'Visual', kind: 'visual' },
    { id: 'defectsVisual', sr: '', name: 'Dents / bend / black mark / rail defect', spec: 'Not Allowed', method: 'Visual', kind: 'visual' }
  ];

  let currentSticker = null;
  let reports = loadReports();
  let observations = emptyObservations();
  let toastTimer = null;

  function emptyObservations() {
    const output = {};
    rows.forEach((row) => {
      output[row.id] = { supplier: ['', '', '', '', ''], knest: ['', '', '', '', ''] };
    });
    return output;
  }

  function loadReports() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current) return JSON.parse(current);
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const migrated = JSON.parse(legacy);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
      return [];
    } catch (error) {
      return [];
    }
  }

  function persistReports() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  }

  function toast(message) {
    const element = $('toast');
    element.textContent = message;
    element.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { element.style.display = 'none'; }, 2600);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function switchTab(id) {
    document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === id));
    document.querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === id));
    if (id === 'report') renderReport();
    if (id === 'history') renderHistory();
    window.scrollTo(0, 0);
  }

  function hasAndroidBridge() {
    return Boolean(window.Android && typeof window.Android.startNativeScanner === 'function');
  }

  function openKnestfs() {
    if (hasAndroidBridge()) {
      window.Android.openKnestfs();
      return;
    }
    window.location.href = 'intent://open/#Intent;scheme=knestfs;package=com.knestfs;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.knestfs;end';
  }

  function parseSticker(raw) {
    if (!window.DKStickerParser) throw new Error('Sticker parser load नहीं हुआ।');
    return window.DKStickerParser.parseSticker(raw);
  }

  function duplicateBarcode(side, sampleIndex, barcode) {
    if (!barcode) return false;
    return observations.barcode[side].some((value, index) => index !== sampleIndex && value === barcode);
  }

  function fillFromSticker(data) {
    const side = $('scanSide').value;
    const sampleIndex = Number($('sampleNo').value) - 1;

    if (duplicateBarcode(side, sampleIndex, data.barcode)) {
      const continueScan = window.confirm('यह barcode इसी side में पहले scan हो चुका है। फिर भी replace करना है?');
      if (!continueScan) return;
    }

    const existingBarcode = observations.barcode[side][sampleIndex];
    if (existingBarcode && existingBarcode !== data.barcode) {
      const replace = window.confirm('इस sample में पहले से data है। Replace करना है?');
      if (!replace) return;
    }

    currentSticker = data;
    observations.sticker[side][sampleIndex] = 'OK';
    observations.ipo[side][sampleIndex] = data.ipo;
    observations.part[side][sampleIndex] = data.partDescription;
    observations.barcode[side][sampleIndex] = data.barcode;
    observations.length[side][sampleIndex] = String(data.length);
    observations.width[side][sampleIndex] = String(data.width);
    observations.diagonal[side][sampleIndex] = data.diagonal.toFixed(2);

    $('projectCode').value = data.project || '';
    $('unitCode').value = data.unit || '';
    $('stickerCompany').value = data.stickerCompany || '';
    $('fullPart').value = data.fullPartDescription || '';

    if (data.stickerCompany && data.stickerCompany.toUpperCase() !== 'KNEST' && !$('supplier').value) {
      $('supplier').value = data.stickerCompany;
    }

    renderParsed();
    renderReport();
    updateDashboard();
    $('scanStatus').textContent = 'Sticker successfully scanned';
    $('scanBadge').textContent = 'Scanned';
    toast('Sample ' + (sampleIndex + 1) + ' report में भर गया');

    if (sampleIndex < 4) $('sampleNo').value = String(sampleIndex + 2);
    switchTab('scanner');
  }

  function renderParsed() {
    const parsed = $('parsed');
    if (!currentSticker) {
      parsed.innerHTML = '<div class="mut">Sticker scan होने के बाद data यहाँ आएगा।</div>';
      $('dashLast').innerHTML = '<div class="mut">No sticker scanned</div>';
      return;
    }

    const data = [
      ['Barcode', currentSticker.barcode],
      ['IPO', currentSticker.ipo],
      ['Unit', currentSticker.unit],
      ['Sticker Company', currentSticker.stickerCompany],
      ['Width', currentSticker.width + ' mm'],
      ['Part', currentSticker.partDescription],
      ['Length', currentSticker.length + ' mm'],
      ['Diagonal', currentSticker.diagonal.toFixed(2) + ' mm'],
      ['Project', currentSticker.project],
      ['Area', currentSticker.area]
    ];

    parsed.innerHTML = data.map((item) => '<div class="data"><span>' + item[0] + '</span><b>' + escapeHtml(item[1] || '—') + '</b></div>').join('');
    $('dashLast').innerHTML = data.slice(0, 8).map((item) => '<div class="data"><span>' + item[0] + '</span><b>' + escapeHtml(item[1] || '—') + '</b></div>').join('');
  }

  function targetValue(row) {
    if (!currentSticker) return null;
    if (row.id === 'length') return currentSticker.length;
    if (row.id === 'width') return currentSticker.width;
    if (row.id === 'diagonal') return currentSticker.diagonal;
    return null;
  }

  function cellStatus(row, value) {
    if (value === '' || value == null) return '';
    const text = String(value).trim();

    if (row.kind === 'auto' || row.kind === 'text' || row.kind === 'visual') {
      return text.toUpperCase() === 'NG' ? 'NG' : 'OK';
    }

    const number = Number(text);
    if (!Number.isFinite(number)) return 'NG';

    if (row.kind === 'range') return number >= row.min && number <= row.max ? 'OK' : 'NG';
    if (row.kind === 'target' || row.kind === 'diagonal') {
      const target = targetValue(row);
      return target != null && number >= target - row.tolerance && number <= target ? 'OK' : 'NG';
    }
    return '';
  }

  function overallStatus(row, side) {
    const values = observations[row.id][side];
    let hasValue = false;
    for (const value of values) {
      const status = cellStatus(row, value);
      if (status === 'NG') return 'NG';
      if (status === 'OK') hasValue = true;
    }
    return hasValue ? 'OK' : '';
  }

  function reportStatus() {
    let hasAny = false;
    for (const row of rows) {
      for (const side of ['supplier', 'knest']) {
        for (const value of observations[row.id][side]) {
          const status = cellStatus(row, value);
          if (status === 'NG') return 'NG';
          if (status === 'OK') hasAny = true;
        }
      }
    }
    return hasAny ? 'OK' : 'PENDING';
  }

  function updateReportResult() {
    const status = reportStatus();
    const badge = $('reportResult');
    badge.textContent = status;
    badge.className = 'result ' + (status === 'NG' ? 'ng-result' : status === 'OK' ? 'ok-result' : 'pending-result');
  }

  function renderReport() {
    let html = '';
    rows.forEach((row) => {
      html += '<tr><td>' + row.sr + '</td><td class="check">' + escapeHtml(row.name) + '</td><td>' + escapeHtml(row.spec) + '</td><td>' + escapeHtml(row.method) + '</td>';
      ['supplier', 'knest'].forEach((side) => {
        for (let index = 0; index < 5; index += 1) {
          const value = observations[row.id][side][index];
          const status = cellStatus(row, value);
          const className = status === 'OK' ? 'ok' : status === 'NG' ? 'ng' : value ? 'pending' : '';
          html += '<td class="obs ' + className + '"><input data-row="' + row.id + '" data-side="' + side + '" data-index="' + index + '" value="' + escapeHtml(value) + '" ' + (row.kind === 'auto' ? 'readonly' : '') + '></td>';
        }
      });
      ['supplier', 'knest'].forEach((side) => {
        const overall = overallStatus(row, side);
        const overallClass = overall === 'OK' ? 'ok' : overall === 'NG' ? 'ng' : '';
        html += '<td class="overall ' + overallClass + '">' + overall + '</td>';
      });
      html += '</tr>';
    });

    $('reportBody').innerHTML = html;
    document.querySelectorAll('#reportBody input').forEach((input) => {
      input.addEventListener('change', () => {
        observations[input.dataset.row][input.dataset.side][Number(input.dataset.index)] = input.value.trim();
        renderReport();
        updateDashboard();
      });
    });
    updateReportResult();
  }

  function countState() {
    let ok = 0;
    let ng = 0;
    let scans = 0;

    rows.forEach((row) => {
      ['supplier', 'knest'].forEach((side) => {
        observations[row.id][side].forEach((value) => {
          const status = cellStatus(row, value);
          if (status === 'OK') ok += 1;
          if (status === 'NG') ng += 1;
        });
      });
    });

    ['supplier', 'knest'].forEach((side) => {
      for (let index = 0; index < 5; index += 1) {
        if (observations.barcode[side][index] || observations.ipo[side][index] || observations.part[side][index]) scans += 1;
      }
    });

    return { ok: ok, ng: ng, scans: scans };
  }

  function updateDashboard() {
    const counts = countState();
    $('kpiReports').textContent = String(reports.length);
    $('kpiScans').textContent = String(counts.scans);
    $('kpiOk').textContent = String(counts.ok);
    $('kpiNg').textContent = String(counts.ng);
    renderParsed();
    updateReportResult();
  }

  function collectReport() {
    return {
      id: Date.now(),
      savedAt: new Date().toISOString(),
      date: $('date').value,
      supplier: $('supplier').value.trim(),
      invoice: $('invoice').value.trim(),
      qty: $('qty').value,
      formatNo: $('formatNo').value.trim(),
      revNo: $('revNo').value.trim(),
      revDate: $('revDate').value.trim(),
      oriDate: $('oriDate').value.trim(),
      projectCode: $('projectCode').value.trim(),
      unitCode: $('unitCode').value.trim(),
      stickerCompany: $('stickerCompany').value.trim(),
      fullPart: $('fullPart').value.trim(),
      supplierInspector: $('supplierInspector').value.trim(),
      knestInspector: $('knestInspector').value.trim(),
      approvedBy: $('approvedBy').value.trim(),
      remark: $('remark').value.trim(),
      result: reportStatus(),
      currentSticker: currentSticker,
      observations: JSON.parse(JSON.stringify(observations))
    };
  }

  function validateBeforeSave() {
    const counts = countState();
    if (!counts.scans) {
      toast('पहले कम से कम एक sticker scan करें।');
      switchTab('scanner');
      return false;
    }
    if (counts.ng > 0 && !$('remark').value.trim()) {
      toast('NG मिला है, इसलिए Remark जरूरी है।');
      $('remark').focus();
      return false;
    }
    return true;
  }

  function saveReport() {
    if (!validateBeforeSave()) return;
    const report = collectReport();
    reports.push(report);
    persistReports();
    updateDashboard();
    toast('Report saved: ' + report.result);
  }

  function applyReport(report) {
    currentSticker = report.currentSticker || report.current || null;
    observations = report.observations || report.obs || emptyObservations();
    const fields = [
      'date', 'supplier', 'invoice', 'qty', 'formatNo', 'revNo', 'revDate', 'oriDate',
      'projectCode', 'unitCode', 'stickerCompany', 'fullPart', 'supplierInspector',
      'knestInspector', 'approvedBy', 'remark'
    ];
    fields.forEach((id) => { $(id).value = report[id] || ''; });
    renderReport();
    updateDashboard();
    switchTab('report');
  }

  function renderHistory() {
    const list = $('historyList');
    if (!reports.length) {
      list.innerHTML = '<div class="mut">No saved reports</div>';
      return;
    }

    list.innerHTML = reports.slice().reverse().map((report) => {
      const resultClass = report.result === 'NG' ? 'ng-result' : report.result === 'OK' ? 'ok-result' : 'pending-result';
      const part = report.currentSticker ? report.currentSticker.fullPartDescription : report.fullPart;
      return '<div class="history-card"><div><b>' + escapeHtml(report.invoice || 'PDI Report') + '</b><div class="mut">' + escapeHtml(report.date || '') + ' • ' + escapeHtml(report.projectCode || (report.currentSticker && report.currentSticker.project) || '') + ' • ' + escapeHtml(part || '') + '</div><span class="result ' + resultClass + '">' + escapeHtml(report.result || 'PENDING') + '</span></div><div class="history-actions"><button class="btn blue" data-open="' + report.id + '">Open</button><button class="btn red" data-delete="' + report.id + '">Delete</button></div></div>';
    }).join('');

    document.querySelectorAll('[data-open]').forEach((button) => {
      button.addEventListener('click', () => {
        const report = reports.find((item) => String(item.id) === button.dataset.open);
        if (report) applyReport(report);
      });
    });

    document.querySelectorAll('[data-delete]').forEach((button) => {
      button.addEventListener('click', () => {
        if (!window.confirm('यह report delete करना है?')) return;
        reports = reports.filter((item) => String(item.id) !== button.dataset.delete);
        persistReports();
        renderHistory();
        updateDashboard();
        toast('Report deleted');
      });
    });
  }

  function newReport() {
    currentSticker = null;
    observations = emptyObservations();
    ['supplier', 'invoice', 'qty', 'revNo', 'revDate', 'projectCode', 'unitCode', 'stickerCompany', 'fullPart', 'supplierInspector', 'knestInspector', 'approvedBy', 'remark', 'manual'].forEach((id) => { $(id).value = ''; });
    $('date').value = new Date().toISOString().slice(0, 10);
    $('oriDate').value = '01-12-2025';
    $('formatNo').value = 'KMPL/QMS/QAF-';
    $('sampleNo').value = '1';
    $('scanSide').value = 'supplier';
    $('scanBadge').textContent = 'Not Scanned';
    $('scanStatus').textContent = 'Scan Sticker दबाएँ';
    renderReport();
    updateDashboard();
    toast('New report ready');
  }

  function htmlForExport() {
    const clone = $('reportPage').cloneNode(true);
    clone.querySelectorAll('input, textarea').forEach((field) => {
      const span = document.createElement('span');
      span.textContent = field.value;
      span.style.whiteSpace = 'pre-wrap';
      field.replaceWith(span);
    });
    return '<html><head><meta charset="utf-8"><style>body{font-family:Arial}table{border-collapse:collapse;width:100%}th,td{border:1px solid #111;padding:4px;font-size:10px}.ok{background:#dcfce7}.ng{background:#fee2e2}</style></head><body>' + clone.outerHTML + '</body></html>';
  }

  function saveBlob(filename, blob) {
    if (hasAndroidBridge() && typeof window.Android.saveBase64File === 'function') {
      const reader = new FileReader();
      reader.onloadend = () => window.Android.saveBase64File(filename, String(reader.result).split(',')[1], blob.type || 'application/octet-stream');
      reader.readAsDataURL(blob);
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  }

  function exportExcel() {
    const filename = 'PDI_' + ($('invoice').value.trim() || $('date').value || 'report') + '.xls';
    saveBlob(filename, new Blob([htmlForExport()], { type: 'application/vnd.ms-excel' }));
  }

  function backupJson() {
    saveBlob('DK_PDI_Backup_' + new Date().toISOString().slice(0, 10) + '.json', new Blob([JSON.stringify(reports, null, 2)], { type: 'application/json' }));
  }

  function restoreJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const restored = JSON.parse(String(reader.result));
        if (!Array.isArray(restored)) throw new Error('Backup format invalid');
        reports = restored;
        persistReports();
        renderHistory();
        updateDashboard();
        toast('Backup restored: ' + reports.length + ' reports');
      } catch (error) {
        toast('Restore failed: ' + error.message);
      }
      $('restoreInput').value = '';
    };
    reader.readAsText(file);
  }

  window.dkHandleNativeScan = function (raw) {
    try {
      $('manual').value = raw;
      fillFromSticker(parseSticker(raw));
    } catch (error) {
      $('scanStatus').textContent = error.message;
      toast(error.message);
    }
  };

  window.dkNativeScannerError = function (message) {
    $('scanStatus').textContent = message || 'Scanner बंद हुआ';
    toast(message || 'Scanner बंद हुआ');
  };

  $('loginBtn').addEventListener('click', () => {
    if ($('password').value !== '12345') return toast('Wrong password');
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
    updateDashboard();
  });
  $('password').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('loginBtn').click(); });
  $('logout').addEventListener('click', () => window.location.reload());

  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.go)));
  ['knestSide', 'knestDash', 'knestScan'].forEach((id) => $(id).addEventListener('click', openKnestfs));

  $('scanBtn').addEventListener('click', () => {
    $('scanStatus').textContent = 'Camera opening...';
    if (hasAndroidBridge()) window.Android.startNativeScanner();
    else toast('Native scanner APK में खुलेगा। Manual QR data भी डाल सकते हैं।');
  });

  $('parseBtn').addEventListener('click', () => {
    try { fillFromSticker(parseSticker($('manual').value)); }
    catch (error) { toast(error.message); }
  });

  $('newBtn').addEventListener('click', newReport);
  $('saveBtn').addEventListener('click', saveReport);
  $('exportBtn').addEventListener('click', exportExcel);
  $('printBtn').addEventListener('click', () => {
    if (hasAndroidBridge() && typeof window.Android.printCurrentPage === 'function') window.Android.printCurrentPage();
    else window.print();
  });

  $('visualOk').addEventListener('click', () => {
    rows.filter((row) => row.kind === 'visual').forEach((row) => {
      ['supplier', 'knest'].forEach((side) => {
        observations[row.id][side] = observations[row.id][side].map((value) => value || 'OK');
      });
    });
    renderReport();
    updateDashboard();
    toast('Blank visual checks marked OK');
  });

  $('backupBtn').addEventListener('click', backupJson);
  $('restoreInput').addEventListener('change', (event) => restoreJson(event.target.files && event.target.files[0]));
  $('clearHistory').addEventListener('click', () => {
    if (!window.confirm('All saved reports clear करना है?')) return;
    reports = [];
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_KEY);
    renderHistory();
    updateDashboard();
    toast('All reports cleared');
  });

  newReport();
})();
