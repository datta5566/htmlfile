# DK Quality Inspection System

Mobile-first Aluminium Formwork part inspection application.

## Included
- Inspector login/session name
- Sticker/QR manual parsing with Android scanner bridge hook
- Project/part/barcode/drawing/revision identity gate
- Approved drawing PDF/image upload and viewer
- Drawing/manual verification hold state
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

## Important limitation
The browser build displays uploaded drawings but does not silently infer unreadable dimensions. Drawing OCR/automatic dimension extraction and camera measurement assistance remain extension points; uncertain values must be manually verified.

## Open locally
Open `Quality_Inspection_System/index.html` in a browser or serve the repository with a local static server.

## Android
The existing `DK_PDI_Android` project already contains the native QR scanner bridge. This web build exposes the same `window.Android.startNativeScanner()` hook when packaged inside the Android WebView.
