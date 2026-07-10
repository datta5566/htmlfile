# DK Central Cloud System

This folder adds central cloud storage and an owner dashboard for:

- UA/UC Converter
- Kaizen Converter
- Rejection Management System
- File Store Pro

Users must open the applications through `cloud-system/index.html`. The portal loads the existing apps and syncs their browser records to one cloud database. The owner uses `cloud-system/admin.html` to view and export all users' data.

## What is included

- Email/password accounts for every user
- Automatic sync approximately every 15 seconds
- Separate user and device identification
- Owner-only access to all records
- Search by user, app, barcode, part, unit or record text
- CSV export and full JSON backup
- Private upload storage for File Store documents/images
- Row Level Security so normal users can read only their own records

## Setup steps

1. Create a Supabase project.
2. Open its SQL Editor.
3. Run `01-database.sql` completely.
4. Run `02-private-file-storage.sql` completely.
5. In Authentication settings, enable Email/Password login.
6. Add this site URL and redirect URL:
   `https://datta5566.github.io/htmlfile/cloud-system/`
7. Open `supabase-config.js` and paste the project URL and publishable key.
8. Open the user portal and create the owner's account.
9. In the SQL Editor, promote that account once:
   `update public.profiles set role='admin' where email='OWNER_EMAIL@example.com';`
10. Open the admin dashboard and log in with the owner account.

## Final links after configuration

- User portal: `https://datta5566.github.io/htmlfile/cloud-system/`
- Owner dashboard: `https://datta5566.github.io/htmlfile/cloud-system/admin.html`

## Important security rules

- Use only the browser-safe publishable key in `supabase-config.js`.
- Never place a secret server key in GitHub or browser JavaScript.
- Keep Row Level Security enabled.
- Give the `admin` role only to the owner or specifically approved managers.
- Users should not use the old direct app links after cloud launch; they should use the central portal.
- Export regular JSON backups from the admin dashboard.

## Storage capacity

Cloud storage is scalable but not literally unlimited. The available database, bandwidth and file storage depend on the selected Supabase plan. Large uploaded files are copied to the private `dk-app-files` bucket instead of being kept inside database JSON.

## Existing local data

When a user logs into the portal for the first time, supported records already saved in that browser are uploaded to the cloud. Data stored on another phone/computer will sync when that device logs in through the portal.
