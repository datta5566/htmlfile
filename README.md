# Static HTML Applications

This repository contains several browser-only converter and quality applications.

## Application inventory

| Path | Purpose | Current security status |
|---|---|---|
| `index.html` | UA/UC near-miss WhatsApp to Excel converter | Client-side login only; any 5-digit PIN currently passes after the fixed user ID. Do not treat this as secure authentication. |
| `ua-uc/index.html` | UA/UC converter page | Browser-only local storage; no server-side access control. |
| `kaizen/index.html` | Multi-file Kaizen Excel converter | Browser-only local storage; no login or encryption. |
| `kaizen/minimal.html` | Test/minimal Kaizen page | Test file; not recommended for production use. |
| `kaizen/simple.html` | Simple Kaizen page | Test/simple file; verify before production use. |
| `kaizen/sheetjs-test2.html` | SheetJS test page | Test file; not recommended for production use. |
| `Rejection_Management_System_V2_Ultra_Professional.html` | Rejection management dashboard | Contains and displays the default password `12345`; this is not secure. Do not use it for confidential records until authentication is redesigned. |

## Data storage

The apps use browser `localStorage`. Records remain only in that browser profile. Clearing browser data or changing devices may remove the records. Data is not encrypted.

## Safe use

- Use HTTPS or localhost.
- Export backups regularly.
- Do not enter confidential personal or customer information.
- Do not add API keys or real passwords to HTML/JavaScript.
- Keep test pages separate from the production link.
- Read `SECURITY.md` before company use.

## Automated checks

GitHub Actions checks for insecure HTTP links, obvious committed API keys/tokens and dangerous dynamic JavaScript. Dependabot monitors GitHub Actions versions.
