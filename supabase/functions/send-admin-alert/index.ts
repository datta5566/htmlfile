const jsonHeaders = { "content-type": "application/json" };

function safe(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
  }

  const webhookSecret = Deno.env.get("WEBHOOK_SECRET") || "";
  if (!webhookSecret || request.headers.get("x-webhook-secret") !== webhookSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY") || "";
  const adminEmail = Deno.env.get("ADMIN_ALERT_EMAIL") || "";
  const fromEmail = Deno.env.get("ALERT_FROM_EMAIL") || "";
  if (!resendKey || !adminEmail || !fromEmail) {
    return new Response(JSON.stringify({ error: "Email secrets are not configured" }), { status: 500, headers: jsonHeaders });
  }

  const payload = await request.json();
  const notification = payload?.record;
  if (!notification?.id) {
    return new Response(JSON.stringify({ error: "Notification record missing" }), { status: 400, headers: jsonHeaders });
  }

  const subject = `DK App Alert: ${notification.title || "New record"}`;
  const html = `
    <h2>${safe(notification.title || "New record submitted")}</h2>
    <p><b>Application:</b> ${safe(notification.app_code)}</p>
    <p><b>Summary:</b> ${safe(notification.message)}</p>
    <p><b>Time:</b> ${safe(notification.created_at)}</p>
    <p>Open the DK Admin Dashboard to view the complete record.</p>
  `;

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${resendKey}`,
      "content-type": "application/json",
      "idempotency-key": String(notification.id)
    },
    body: JSON.stringify({ from: fromEmail, to: [adminEmail], subject, html })
  });

  const emailResult = await emailResponse.text();
  if (!emailResponse.ok) {
    return new Response(emailResult, { status: emailResponse.status, headers: jsonHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (supabaseUrl && serviceKey) {
    await fetch(`${supabaseUrl}/rest/v1/admin_notifications?id=eq.${notification.id}`, {
      method: "PATCH",
      headers: {
        "apikey": serviceKey,
        "authorization": `Bearer ${serviceKey}`,
        "content-type": "application/json",
        "prefer": "return=minimal"
      },
      body: JSON.stringify({ emailed_at: new Date().toISOString() })
    });
  }

  return new Response(emailResult, { status: 200, headers: jsonHeaders });
});
