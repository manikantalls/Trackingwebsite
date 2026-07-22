import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ShipmentRow {
  id: string;
  cw: string;
  booking: string;
  vessel: string;
  pick_up: string | null;
  ets: string | null;
  eta: string | null;
  remarks: string;
  alert_sent_at: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function transitDays(pickUp: string | null, eta: string | null): number | null {
  if (!pickUp || !eta) return null;
  const p = new Date(pickUp);
  const a = new Date(eta);
  if (isNaN(p.getTime()) || isNaN(a.getTime())) return null;
  return Math.round((a.getTime() - p.getTime()) / 86400000);
}

function fillTemplate(
  template: string,
  s: ShipmentRow,
  td: number,
): string {
  return template
    .replace(/\{remarks\}/gi, s.remarks || "")
    .replace(/\{booking\}/gi, s.booking || "")
    .replace(/\{vessel\}/gi, s.vessel || "")
    .replace(/\{cw\}/gi, s.cw || "")
    .replace(/\{ets\}/gi, fmtDate(s.ets))
    .replace(/\{eta\}/gi, fmtDate(s.eta))
    .replace(/\{transit_days\}/gi, String(td));
}

async function loadCredentials(supabase: ReturnType<typeof createClient>): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc("get_outlook_credentials");
  if (error) throw new Error(`Failed to load credentials from vault: ${error.message}`);
  const map: Record<string, string> = {};
  for (const row of (data ?? [])) map[row.name] = row.secret;
  return map;
}

async function getAccessToken(supabase: ReturnType<typeof createClient>): Promise<string> {
  const creds = await loadCredentials(supabase);
  const clientId = creds["OUTLOOK_CLIENT_ID"];
  const tenantId = creds["OUTLOOK_TENANT_ID"];
  const clientSecret = creds["OUTLOOK_CLIENT_SECRET"];

  if (!clientId || !tenantId || !clientSecret) {
    throw new Error("Outlook credentials not configured. Add OUTLOOK_CLIENT_ID, OUTLOOK_TENANT_ID, OUTLOOK_CLIENT_SECRET to the Supabase vault.");
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OAuth token request failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  if (!data.access_token) {
    throw new Error("OAuth token response missing access_token");
  }
  return data.access_token;
}

async function sendMail(
  token: string,
  fromAddress: string,
  to: string[],
  cc: string[],
  subject: string,
  body: string,
): Promise<void> {
  const url = `https://graph.microsoft.com/v1.0/users/${fromAddress}/sendMail`;
  const payload = {
    message: {
      subject,
      body: { contentType: "Text", content: body },
      toRecipients: to.map((email) => ({ emailAddress: { address: email } })),
      ccRecipients: cc.map((email) => ({ emailAddress: { address: email } })),
    },
    saveToSentItems: true,
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Graph sendMail failed (${resp.status}): ${text}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return err("Method not allowed", 405);

    const body = await req.json();
    const mode = body?.mode ?? "all"; // "all" | "test" | "single" | "auto"

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── Auth ──────────────────────────────────────────────────
    // "auto" mode is called by the pg_cron job with a shared secret.
    // All other modes require an authenticated admin.
    let callerEmail: string | null = null;

    if (mode === "auto") {
      const creds = await loadCredentials(supabase);
      const cronSecret = creds["CRON_SECRET"];
      const providedSecret = body?.cron_secret;
      if (!cronSecret || cronSecret !== providedSecret) {
        return err("Unauthorized: invalid cron secret", 401);
      }
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return err("Unauthorized", 401);

      const token = authHeader.replace("Bearer ", "");
      const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !caller) return err("Unauthorized", 401);

      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", caller.id)
        .maybeSingle();
      if (callerProfile?.role !== "admin") return err("Forbidden", 403);
      callerEmail = caller.email ?? null;
    }

    // ── Load alert config ─────────────────────────────────────
    const { data: config, error: configErr } = await supabase
      .from("alert_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (configErr || !config) {
      return err("No alert configuration found. Please configure alerts in the settings page first.");
    }

    const fromAddress = config.from_address;
    if (!fromAddress) {
      return err("No 'from' email address configured. Set it in the alert settings page.");
    }

    const toRecipients: string[] = config.to_recipients ?? [];
    const ccRecipients: string[] = config.cc_recipients ?? [];

    if (toRecipients.length === 0 && mode !== "test") {
      return err("No 'To' recipients configured. Add at least one recipient in the alert settings page.");
    }

    // ── Get OAuth token ───────────────────────────────────────
    let accessToken: string;
    try {
      accessToken = await getAccessToken(supabase);
    } catch (e) {
      return err(String(e), 500);
    }

    // ── Test mode ─────────────────────────────────────────────
    if (mode === "test") {
      const testTo = body?.test_email ?? callerEmail;
      if (!testTo) return err("No test email address provided");

      const subject = `[TEST] ${config.subject_template}`;
      const bodyText = `[TEST] This is a test delay alert email.\n\nTemplate preview:\n${config.body_template}`;

      try {
        await sendMail(accessToken, fromAddress, [testTo], [], subject, bodyText);
        await supabase.from("alert_log").insert({
          recipient: testTo,
          subject,
          status: "sent",
          auto_sent: false,
        });
        return ok({ success: true, message: `Test email sent to ${testTo}` });
      } catch (e) {
        await supabase.from("alert_log").insert({
          recipient: testTo,
          subject,
          status: "failed",
          error: String(e),
          auto_sent: false,
        });
        return err(String(e), 500);
      }
    }

    // ── Load shipments ────────────────────────────────────────
    const selectCols = mode === "auto"
      ? "id, cw, booking, vessel, pick_up, ets, eta, remarks, alert_sent_at"
      : "id, cw, booking, vessel, pick_up, ets, eta, remarks";

    const { data: shipments, error: shipErr } = await supabase
      .from("shipments")
      .select(selectCols);

    if (shipErr) return err(shipErr.message, 500);

    const threshold = config.transit_threshold ?? 42;
    const allShipments = (shipments ?? []) as ShipmentRow[];

    let targets: ShipmentRow[];

    if (mode === "single") {
      targets = allShipments.filter((s) => s.id === body?.shipment_id);
      if (targets.length === 0) return err("Shipment not found");
    } else if (mode === "auto") {
      // Auto mode: only shipments that are delayed AND haven't been alerted yet
      targets = allShipments.filter((s) => {
        const td = transitDays(s.pick_up, s.eta);
        return td !== null && td > threshold && !s.alert_sent_at;
      });
    } else {
      // "all" mode: all delayed shipments (manual trigger, ignores alert_sent_at)
      targets = allShipments.filter((s) => {
        const td = transitDays(s.pick_up, s.eta);
        return td !== null && td > threshold;
      });
    }

    if (targets.length === 0) {
      return ok({ success: true, message: "No delayed shipments to alert.", sent: 0, results: [] });
    }

    const results: { shipment_id: string; booking: string; status: string; error?: string }[] = [];
    let sentCount = 0;
    const isAuto = mode === "auto";

    for (const s of targets) {
      const td = transitDays(s.pick_up, s.eta) ?? 0;
      const subject = fillTemplate(config.subject_template, s, td);
      const bodyText = fillTemplate(config.body_template, s, td);

      try {
        await sendMail(accessToken, fromAddress, toRecipients, ccRecipients, subject, bodyText);
        await supabase.from("alert_log").insert({
          shipment_id: s.id,
          recipient: toRecipients.join(", "),
          subject,
          status: "sent",
          auto_sent: isAuto,
        });

        // Mark the shipment as alerted so it won't be auto-emailed again
        await supabase
          .from("shipments")
          .update({ alert_sent_at: new Date().toISOString() })
          .eq("id", s.id);

        results.push({ shipment_id: s.id, booking: s.booking, status: "sent" });
        sentCount++;
      } catch (e) {
        await supabase.from("alert_log").insert({
          shipment_id: s.id,
          recipient: toRecipients.join(", "),
          subject,
          status: "failed",
          error: String(e),
          auto_sent: isAuto,
        });
        results.push({ shipment_id: s.id, booking: s.booking, status: "failed", error: String(e) });
      }
    }

    return ok({ success: true, sent: sentCount, total: targets.length, results });
  } catch (e) {
    return err(String(e), 500);
  }
});
