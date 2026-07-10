# DK Cloud OTP and Owner Alert Setup

This setup enables:

- Six-digit email OTP login for users and the administrator.
- One cloud event for each new or edited app record.
- Live unread notifications in the administrator dashboard.
- An email alert sent only to the owner's email address.

## 1. Database setup

Run these files in Supabase SQL Editor in order:

1. `01-database.sql`
2. `02-private-file-storage.sql`
3. `03-notifications.sql`

The first synchronization creates a quiet baseline for records already present in that browser. It does not email every old record. New or edited records after the baseline create notifications.

## 2. Configure six-digit email OTP

In Supabase Dashboard open Authentication > Email Templates > Magic Link.

Replace the message body with a template containing the token variable:

```html
<h2>DK Apps Login OTP</h2>
<p>Your six-digit login code is:</p>
<h1>{{ .Token }}</h1>
<p>Do not share this code with anyone.</p>
```

Set the Site URL and allowed redirect URL to:

`https://datta5566.github.io/htmlfile/cloud-system/`

## 3. Create the owner administrator

1. Open the user portal and request an OTP using the owner's email.
2. Verify the OTP once so the profile is created.
3. Run this SQL after replacing the email:

```sql
update public.profiles
set role = 'admin'
where email = 'OWNER_EMAIL@example.com';
```

Only approved owner accounts should have the `admin` role.

## 4. Deploy the email function

The function source is:

`supabase/functions/send-admin-alert/index.ts`

Deploy it as `send-admin-alert`. Because the database webhook uses its own secret header, deploy the function with JWT verification disabled for this endpoint and protect it with `WEBHOOK_SECRET`.

Set these Supabase Edge Function secrets:

- `RESEND_API_KEY`: mail service API key.
- `ADMIN_ALERT_EMAIL`: only the owner's email address.
- `ALERT_FROM_EMAIL`: a verified sender address.
- `WEBHOOK_SECRET`: a long random private value.

Never place these secrets in GitHub, browser JavaScript, screenshots, or chat messages.

## 5. Create the database webhook

In Supabase Dashboard open Database > Webhooks and create a webhook with:

- Table: `public.admin_notifications`
- Event: `INSERT`
- Method: `POST`
- URL: the deployed `send-admin-alert` Edge Function URL
- Header: `x-webhook-secret` with the same value stored as `WEBHOOK_SECRET`

Each inserted notification is then sent to the owner email. The function uses the notification ID as an idempotency key to reduce duplicate emails if a webhook is retried.

## 6. Browser notification

After administrator OTP login, click **Enable Browser Alerts** once and allow notifications. The dashboard also shows notifications without browser permission.

## 7. Required public configuration

Add only the browser-safe Supabase project URL and publishable key in `supabase-config.js`. Never add a service-role or secret key there.
