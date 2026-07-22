import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-api-key",
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

function parseDate(val: unknown): string | null {
  if (!val) return null;
  const str = String(val).trim();
  const dmY = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmY) return new Date(+dmY[3], +dmY[2] - 1, +dmY[1]).toISOString();
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function cleanStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  let s = String(val).trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1).trim();
  if (s.endsWith(",")) s = s.slice(0, -1).trim();
  return s;
}

function field(row: Record<string, unknown>, ...keys: string[]): unknown {
  const normalized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    normalized[k.toLowerCase().replace(/[\s_-]+/g, "")] = v;
  }
  for (const key of keys) {
    const val = normalized[key.toLowerCase().replace(/[\s_-]+/g, "")];
    if (val !== undefined && val !== null && val !== "") return val;
  }
  return "";
}

interface ItemResult {
  subject: string;
  cw: string;
  updated?: number;
  error?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("WEBHOOK_API_KEY");
    if (apiKey) {
      const provided =
        req.headers.get("x-api-key") ??
        req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (provided !== apiKey) return err("Unauthorized", 401);
    }

    if (req.method !== "POST") return err("Method not allowed", 405);

    const text = await req.text();
    if (!text || text.trim() === "") return err("Empty request body");
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return err("Invalid JSON: " + text.slice(0, 200));
    }

    const rawRows: Record<string, unknown>[] = Array.isArray(body)
      ? body
      : [body as Record<string, unknown>];
    if (rawRows.length === 0) return err("No items provided");
    if (rawRows.length > 500) return err("Too many items — max 500 per request");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date().toISOString();
    const results: ItemResult[] = [];

    for (const raw of rawRows) {
      const subjectRaw = cleanStr(field(raw, "subject")).toLowerCase();
      const cwRaw = cleanStr(field(raw, "cw"));
      const cwNum = cwRaw.replace(/^cw/i, "").trim();
      const cwLabel = `CW${cwNum}`;

      if (subjectRaw !== "insert" && subjectRaw !== "update") {
        results.push({ subject: subjectRaw || "(missing)", cw: cwRaw, error: "Subject must be 'Insert' or 'Update'" });
        continue;
      }
      if (!cwNum) {
        results.push({ subject: subjectRaw, cw: cwRaw, error: "Missing CW" });
        continue;
      }

      const booking = cleanStr(field(raw, "booking"));
      const vessel = cleanStr(field(raw, "vessel"));
      const etsRaw = field(raw, "ets");
      const etaRaw = field(raw, "eta");
      const ets = etsRaw ? parseDate(etsRaw) : null;
      const eta = etaRaw ? parseDate(etaRaw) : null;

      if (etsRaw && !ets) {
        results.push({ subject: subjectRaw, cw: cwLabel, error: `Invalid ETS date: ${etsRaw}` });
        continue;
      }
      if (etaRaw && !eta) {
        results.push({ subject: subjectRaw, cw: cwLabel, error: `Invalid ETA date: ${etaRaw}` });
        continue;
      }

      const updateData: Record<string, unknown> = {};
      if (booking) updateData.booking = booking;
      if (vessel) updateData.vessel = vessel;
      if (ets) updateData.ets = ets;
      if (eta) updateData.eta = eta;

      if (Object.keys(updateData).length === 0) {
        results.push({ subject: subjectRaw, cw: cwLabel, error: "No fields provided" });
        continue;
      }

      // Match both "CW30" and bare "30" formats stored in the database
      const cwMatches = [cwLabel, cwNum];

      if (subjectRaw === "update") {
        const { error: updError, count } = await supabase
          .from("shipments")
          .update({ ...updateData, last_updated: now }, { count: "exact" })
          .in("cw", cwMatches);

        if (updError) {
          results.push({ subject: subjectRaw, cw: cwLabel, error: updError.message });
          continue;
        }
        results.push({ subject: subjectRaw, cw: cwLabel, updated: count ?? 0 });
      } else {
        // Insert mode: fill only empty fields — each field is independent
        let touched = 0;
        let itemError: string | null = null;

        if (booking) {
          const { error: e, count } = await supabase
            .from("shipments")
            .update({ booking, last_updated: now }, { count: "exact" })
            .in("cw", cwMatches)
            .eq("booking", "");
          if (e) itemError = e.message;
          touched = Math.max(touched, count ?? 0);
        }
        if (!itemError && vessel) {
          const { error: e, count } = await supabase
            .from("shipments")
            .update({ vessel, last_updated: now }, { count: "exact" })
            .in("cw", cwMatches)
            .eq("vessel", "");
          if (e) itemError = e.message;
          touched = Math.max(touched, count ?? 0);
        }
        if (!itemError && ets) {
          const { error: e, count } = await supabase
            .from("shipments")
            .update({ ets, last_updated: now }, { count: "exact" })
            .in("cw", cwMatches)
            .is("ets", null);
          if (e) itemError = e.message;
          touched = Math.max(touched, count ?? 0);
        }
        if (!itemError && eta) {
          const { error: e, count } = await supabase
            .from("shipments")
            .update({ eta, last_updated: now }, { count: "exact" })
            .in("cw", cwMatches)
            .is("eta", null);
          if (e) itemError = e.message;
          touched = Math.max(touched, count ?? 0);
        }

        if (itemError) {
          results.push({ subject: subjectRaw, cw: cwLabel, error: itemError });
        } else {
          results.push({ subject: subjectRaw, cw: cwLabel, updated: touched });
        }
      }
    }

    return ok({ success: true, results });
  } catch (e) {
    return err(String(e), 500);
  }
});
