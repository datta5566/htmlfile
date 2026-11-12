# DK Apps — Security Audit & Hardening Plan

**Review date:** 12 November 2026  
**Repository:** https://github.com/datta5566/htmlfile  
**Scope:** Static HTML/JavaScript apps and DK Central Cloud System source.

## Executive summary

The repository contains useful local-first tools, but a browser-only login is not real authentication. A public GitHub repository exposes every HTML/JavaScript value. Browser localStorage/sessionStorage is user-editable and is not encrypted by default.

## Findings

| Severity | Finding | Impact | Required action |
|---|---|---|---|
| Critical | Rejection Management has a hard-coded 12345 password in public HTML/JS | Anyone can read the password; it does not protect records | Remove the fake password gate and move access control to server-side Auth before confidential use |
| High | UA/UC login accepts any five-digit PIN for the expected username | No secret is verified; it only creates a browser session flag | Replace with Supabase OTP / authenticated backend; never treat this lock as access control |
| High | public_submissions allows anon INSERT with WITH CHECK true | Unauthenticated users can submit arbitrary JSON and potentially flood the admin queue | Apply 05-security-hardening.sql; add server-side abuse/rate limiting before reopening anonymous intake |
| High | dk-public-files storage INSERT policy allows anon uploads | Unauthenticated uploads can consume storage / host unwanted content | Apply 05-security-hardening.sql; require authenticated user folder ownership |
| High | Quality Inspection System stores records and photos in localStorage | Data is not encrypted or centrally access-controlled; browser profile access exposes it | Use authenticated private storage/database for sensitive production records; keep local backup as convenience only |
| Medium | Owner email is hard-coded in public admin-v3.js | Exposes the administrator email and ties UI logic to a fixed address | Move to an email input and authorize only by server-verified admin role; do not rely on client email checks |
| Medium | Public browser configuration contains a Supabase publishable key | Publishable keys are expected in browser apps, but are safe only with correct RLS and restricted policies | Never place service-role/secret keys in the browser; review every exposed table and storage policy |

## Immediate safe operating rules

1. Do not put company-confidential, customer, employee, financial or personal data into the static/local-only apps until backend access control is verified.
2. Treat any browser PIN/password as a visual convenience only, not as security.
3. Do not commit service-role keys, secret API keys, SMTP credentials, webhook secrets or tokens.
4. Keep Supabase RLS enabled on every table in exposed schemas.
5. Use private storage and user-owned object paths.
6. Rotate any real credential that was ever committed to public Git history. Deleting it from the current file does not remove historical exposure.

## Deployment blocker

The linked Supabase project xcmkyltojcmeowxbtsfi reported INACTIVE during this review, and the database API returned that the database was not accessible. Therefore no live database migration, RLS verification, advisor scan or OTP test was performed. The SQL in 05-security-hardening.sql is staged for review; it has not been applied to production.

## Verification still required after project restoration

- Apply the migration in a controlled window and test authenticated vs anonymous insert/upload behavior.
- Run Supabase Security Advisors and resolve exposed-table, RLS, function and storage findings.
- Test OTP sign-in, expiry, sign-out and role denial for a normal user.
- Confirm admin role is stored in a protected server-managed profile field and cannot be self-assigned.
- Test owner A cannot read/update/delete owner B's rows or files.
- Add server-side rate limiting / CAPTCHA or a trusted Edge Function for any public intake endpoint.
- Confirm backups and restore procedure before using production data.
