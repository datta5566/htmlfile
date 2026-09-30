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
