# Security Policy

Last reviewed: 10 July 2026

## Important limitation

These applications are static HTML/JavaScript pages. A password or PIN written and checked only in browser JavaScript is not secure authentication because the source code is visible to anyone who can open the public repository or page.

The applications save records in browser `localStorage`. The saved data is not encrypted, is limited to that browser profile, and may be lost when browser data is cleared.

## Safe operating rules

- Do not store passwords, API keys, GitHub tokens, identity documents, financial information or confidential customer documents.
- Use only HTTPS or localhost.
- Export regular Excel or JSON backups to an approved company location.
- Lock the computer or phone when unattended.
- Keep production applications separate from test files.
- Do not rely on a client-side login for company access control.
- Never commit a real password, PIN, API key or token to an HTML file.

## Required architecture for confidential use

For confidential or multi-user company data, use a backend with:

- server-side authentication;
- named user accounts;
- role-based permissions;
- an encrypted database;
- audit logs;
- secure backups;
- session expiry and account lockout.

## Exposed secret response

If a real secret is committed, revoke it immediately. Removing it from the latest file is not enough because it may remain in Git history.
