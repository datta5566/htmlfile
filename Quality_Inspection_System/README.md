# DK Quality Inspection System

Mobile-first Aluminium Formwork part inspection application.

## Included
- Inspector login/session name
- Sticker/QR manual parsing with Android scanner bridge hook
- Project/part/barcode/drawing/revision identity gate
- Part ↔ drawing mapping gate; mismatched project/part/drawing/revision blocks final PASS
- Approved drawing PDF/image upload and viewer
- Drawing/manual verification hold state
- Dynamic drawing characteristics: dimension, hole, milling, stiffener, position, angle and other
- Drawing reference, nominal, tolerance, actual, unit, critical flag and result fields
- Verified drawing text → characteristic builder with Manual Verification Required safety state
- Dynamic dimension characteristics with nominal ± tolerance calculation
- Cutting, Punching, Milling, Welding, Grinding, Cleaning, Lacquering and Final Inspection process gates
- Manual/visual inspection checklist
- Photo evidence linked to inspection ID
- Defect records with OPEN/RECHECK flow
- PASS / REJECT / HOLD final decision logic
- LocalStorage offline-first history and JSON backup
- Browser Print → Save as PDF

## Source
The implementation follows the uploaded Quality Inspection & Process Verification master requirement.

## Phase 6 status
Phase 6 implementation is complete on the `phase-6-final-approval-report` branch. Testing remains intentionally deferred until the final project testing stage.

Phase 6 adds a structured final approval layer: Report No., Inspection Date, Quality Engineer/Approver, Final Decision and Approval Remark. The report header carries Inspection ID, Part and Drawing/Revision context. The system result remains PASS/REJECT/HOLD from the inspection gates, and a PASS approval requires the system result to be PASS plus Quality Engineer and inspection date. Print/PDF output is formatted for a report-oriented page.

## Phase 5 status
Phase 5 implementation is complete on the `phase-5-visual-defect-evidence` branch. Testing remains intentionally deferred until final project testing.

Phase 5 strengthens manual/visual inspection with per-checkpoint result, inspector, date and observation remark. Photo evidence now receives an evidence ID, category, filename, timestamp and inspector, with controlled removal. Defects capture reporter/time and include structured rework action, rework person, rework date and rework remark; a defect cannot move to RECHECK until required rework details are recorded. Visual inspection traceability is a separate final gate, while existing defect and photo history remains locally stored.

## Phase 4 status
Phase 4 implementation is complete on the `phase-4-process-traceability` branch. Testing remains intentionally deferred until the final project testing stage.

Phase 4 adds structured manufacturing-process traceability for Cutting, Punching, Milling, Welding, Grinding, Cleaning, Lacquering / Surface Treatment and Final Inspection. Each process stores status, operator/employee, process date, machine/line, batch/job/lot and process remark. Completed processes must have the required traceability fields before final PASS; NOT APPLICABLE processes remain explicitly recorded. Existing older string-based process records are normalized when opened.

## Phase 3 status
Phase 3 implementation is complete on the `phase-3-measurement-inspection` branch. Testing remains intentionally deferred until the final project testing stage.

Phase 3 adds measurement instrument/calibration capture, measurement method/remark, lower/upper tolerance display, completed-measurement progress, critical-characteristic progress, and a mandatory measurement-record gate.

## Phase 2 status
Phase 2 implementation is complete on the `phase-2-drawing-processing` branch. Full end-to-end testing is intentionally deferred until the final project testing stage.

## Important limitation
The browser build displays uploaded drawings but does not silently infer unreadable dimensions. Drawing OCR/automatic dimension extraction and camera measurement assistance remain extension points; uncertain values must be manually verified.

## Open locally
Open `Quality_Inspection_System/index.html` in a browser or serve the repository with a local static server.

## Android
The existing `DK_PDI_Android` project already contains the native QR scanner bridge. This web build exposes the same `window.Android.startNativeScanner()` hook when packaged inside the Android WebView.


## Phase 7 status
Phase 7 is implemented on the `phase-7-dashboard-history-analytics` branch. Testing remains intentionally deferred until the final project testing stage.

Added capabilities: dashboard pass/reject/hold totals, pass rate, open-defect count, status distribution, recent inspection summary, monthly inspection trend, searchable inspection history, status/unit/inspector/date filters, clear filters, open saved inspection, filtered CSV export and existing JSON backup. Analytics are calculated from the existing LocalStorage inspection records and do not change the Phase 1–6 inspection gates.


## Phase 8 status
Phase 8 adds a dedicated professional inspection report view with printable/PDF-ready sections for identification, summary, dimensions, process traceability, visual inspection, defects/rework and final approval. It uses the existing saved inspection record and does not introduce new inspection decision logic. Testing remains deferred until final project testing.


## Phase 9 — Audit & Evidence Traceability
- Keeps all inspection phases in the same Quality Inspection System project.
- Adds audit metadata: created time/user, last updated time/user and record revision.
- Adds unique photo evidence IDs with category, filename, inspector and timestamp.
- Allows photo evidence removal before final save.
- Adds photo evidence to the professional inspection report.
- Records defect reporter/time and structured rework traceability in the report.
- Corrects professional report measurement range/tolerance field mapping and visual/defect rendering.
- Preserves the existing PASS / REJECT / HOLD safety gates.
- Runtime/full testing remains intentionally deferred until the final testing phase.


## Phase 10 — Drawing / Sticker / QR Traceability
- Keeps the feature inside the same Quality Inspection System project.
- Adds a structured inspection traceability QR payload containing Inspection ID, Project, Part Number, Barcode, Drawing and Revision.
- Generates an inspection QR in the professional report and allows manual regeneration.
- Stores QR payload and generation timestamp with the inspection record.
- QR is intended for traceability/reference; it does not bypass existing inspection gates.
- Uses the QRCode.js browser library for QR rendering.
- Runtime/full testing remains deferred until the final testing phase.


## Phase 11 — QR / Sticker Traceability Retrieval
- Keeps QR traceability inside the same Quality Inspection System project.
- Adds a dedicated QR / Sticker Traceability screen for retrieving saved inspections.
- Supports the Phase 10 JSON QR payload by Inspection ID, with barcode/project/part fallback matching.
- Adds a native Android scanner hook and browser-safe manual payload lookup.
- A successful scan opens the saved inspection and its professional report; it does not create or bypass inspection gates.
- If the inspection is not present in local history, the screen clearly reports that limitation.
- Runtime/full testing remains deferred until the final project testing phase.


## Phase 12 — Backup / Restore & Data Portability
- Keeps backup and restore inside the same Quality Inspection System project.
- Adds validated JSON backup restore for moving inspection history between devices.
- Merges records by Inspection ID while preserving unrelated local records.
- Rejects invalid JSON and records without a valid Inspection ID.
- Restored records become available to Phase 11 QR / Sticker Traceability local lookup.
- Existing inspection gates and decision logic are unchanged.
- Runtime/full testing remains deferred until the final project testing phase.


## Phase 13 — Cloud Sync Foundation
- Keeps cloud synchronization inside the same Quality Inspection System project.
- Adds an optional Cloud Sync screen for Supabase Project URL and anon/publishable key configuration.
- Adds Push Local → Cloud, Pull Cloud → Local, and two-way sync controls.
- Cloud records are keyed by Inspection ID.
- Two-way merge preserves unrelated local records and uses the newer record timestamp when the same Inspection ID exists in both locations.
- Adds `supabase/phase-13-cloud-sync.sql` as the database foundation.
- No service-role secret is accepted or stored.
- Authentication and role-based access are intentionally reserved for Phase 14.
- Existing inspection gates and PASS/REJECT/HOLD decision logic are unchanged.
- Runtime/full testing remains deferred until the final project testing phase.


## Phase 14 — User Roles & Permissions
- Adds Inspector, Quality Engineer and Admin workflow roles.
- Adds a role badge and a permission matrix inside the same Quality Inspection System.
- Inspector can execute inspection, measurements, process verification, visual/evidence capture, backup/report/traceability workflows.
- Quality Engineer receives Inspector permissions plus final approval.
- Admin receives all workflow, cloud and role-management permissions.
- Final approval controls are locked for Inspector role.
- Cloud Sync and Roles tabs are restricted to Admin in the Phase 14 browser workflow.
- Role selection is intentionally local-only and is not secure authentication; server-enforced identity/access is required for production cloud security.
- Existing inspection gates and PASS/REJECT/HOLD logic remain unchanged.
- Runtime/full testing remains deferred until final project testing.


## Phase 15 — Advanced Drawing OCR & Dimension Extraction
- Adds browser-based Tesseract OCR for drawing-image text extraction.
- Adds an OCR candidate panel inside the existing Drawing workflow.
- Extracts only structured candidate dimensions such as nominal, tolerance and unit when recognizable.
- OCR candidates remain explicitly marked for verification; uncertain OCR values cannot auto-PASS.
- OCR text is written into the existing verified drawing-text area so the existing characteristic builder remains the controlled path.
- PDF drawings continue through the existing drawing verification/manual extraction workflow; image OCR can be used when an image representation is available.
- Existing drawing identity, measurement tolerance and HOLD rules remain unchanged.
- Runtime/full testing remains deferred until final project testing.


## Phase 16 — Camera QR / Barcode Scanner Workflow
- Adds a mobile-friendly camera scanner overlay for QR and common 1D barcode formats through the browser BarcodeDetector API when supported.
- Uses the rear/environment camera when available.
- Adds native Android scanner callback support through the existing bridge.
- A scanned Phase 10/11 inspection QR opens the saved inspection traceability workflow.
- A scanned sticker/barcode populates the inspection identity and sticker payload, then continues through the existing identity gate.
- Camera scan does not bypass Project/Part/Drawing/Revision verification and does not create an automatic PASS.
- If browser BarcodeDetector is unavailable, the existing Android/manual fallback remains available.
- Camera stream is stopped after a successful scan or when the scanner is closed.
- Testing remains deferred until final project testing.


## Phase 17 — Offline / PWA Mobile Workflow
- Adds an installable PWA manifest for the same Quality Inspection System.
- Adds a service worker that caches the application shell for offline reopening after the first successful load.
- Adds ONLINE / OFFLINE network status in the top bar.
- Adds an Install App control when the browser exposes the PWA install prompt.
- Keeps LocalStorage inspection history available when the network is unavailable.
- Cloud Sync remains an online feature; offline mode does not pretend cloud data was synchronized.
- External CDN resources such as Tesseract.js / QRCode.js may still require network access unless separately bundled; the offline shell is not treated as offline AI/OCR availability.
- Existing inspection gates and PASS/REJECT/HOLD logic remain unchanged.
- Runtime/full testing remains deferred until the final project testing phase.


## Phase 18 — Draft Autosave & Recovery
- Adds an active inspection draft stored locally in the same Quality Inspection System.
- Draft autosaves after user input/change with a short debounce and also on page exit/backgrounding.
- Adds a Draft status indicator and Resume Draft control in the top bar.
- Resume Draft restores the complete unsaved inspection state without creating a duplicate saved history record.
- Starting a new inspection clears the previous active draft.
- A successfully saved final inspection clears the active draft; if final approval validation rejects the save, the draft remains available for recovery.
- Draft recovery is local-device only and does not claim cloud synchronization.
- LocalStorage quota/storage failures are surfaced as DRAFT STORAGE FULL rather than silently pretending the draft was saved.
- Existing identity, drawing, measurement, process, visual, evidence, approval, QR and PASS/REJECT/HOLD gates remain unchanged.
- Runtime/full testing remains deferred until the final project testing phase.


## Phase 19 — Inspection Audit Trail
- Adds an Audit Trail screen for the current inspection.
- Records key lifecycle events with event ID, timestamp and inspector identity.
- Records inspection creation, section navigation, barcode scan, draft/record resume and final inspection save events.
- Audit timeline is shown chronologically in the Audit Trail screen.
- Maximum retained audit events per inspection is 200 to keep local records bounded.
- Audit data is stored inside the inspection record and follows the existing LocalStorage / JSON backup workflow.
- This is local workflow traceability, not secure server-side audit logging; production security still requires authenticated server enforcement.
- Existing inspection gates and PASS/REJECT/HOLD logic remain unchanged.
- Runtime/full testing remains deferred until the final project testing phase.
