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

function detectStatus(raw: string): { status: string; statusNote: string } {
  const lower = raw.toLowerCase().trim();
  let status = "AT_DEPARTURE_PORT";
  if (lower.includes("deliver")) status = "DELIVERED";
  else if (lower.includes("arriv")) status = "ARRIVED";
  else if (lower.includes("in transit") || lower.includes("transit")) status = "IN_TRANSIT";
  else if (lower.includes("depart")) status = "DEPARTED";
  return { status, statusNote: raw };
}

// Strip extra quotes and trailing commas that n8n sometimes adds from CSV sources
function cleanStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  let s = String(val).trim();
  // Remove wrapping quotes: "value" → value
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1).trim();
  // Remove trailing comma
  if (s.endsWith(",")) s = s.slice(0, -1).trim();
  return s;
}

// Case-insensitive lookup across multiple field name aliases
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

function mapRow(raw: Record<string, unknown>): Record<string, unknown> {
  // ── Fields n8n sends ──────────────────────────────────────────────────────
  const supplier     = cleanStr(field(raw, "supplier", "supplier name", "suppliername"));
  const invoice      = cleanStr(field(raw, "invoice", "invoice number", "invoicenumber", "invoice spl", "spl invoice"));
  const deliveryNote = cleanStr(field(raw, "delivery note", "deliverynote", "delivery note number", "deliverynotenumber"));
  const po           = cleanStr(field(raw, "po", "purchase order", "purchaseorder", "purchase order number", "purchaseordernumber"));
  const partNumber   = cleanStr(field(raw, "part number", "partnumber"));

  // Quantity: prefer explicit string, fall back to pieces count; bare numbers get " PCS" appended
  const quantityRaw = field(raw, "quantity");
  const piecesRaw   = field(raw, "number of pieces", "numberofpieces", "pieces");
  const quantityVal = quantityRaw || piecesRaw;
  const quantity = quantityVal
    ? /^\d+(\.\d+)?$/.test(String(quantityVal).trim())
      ? `${String(quantityVal).trim()} PCS`
      : cleanStr(quantityVal)
    : "";

  // Weight — also accepts total_weight_kg. Zero is a valid value, so use an explicit
  // check instead of `|| 0` which would swallow a legitimate 0.
  const kiloRaw = field(raw,
    "total weight", "totalweight", "total weight kg", "totalweightkg", "weight kg", "weightkg",
    "weight", "kilo"
  );
  const kilo = kiloRaw !== "" && !isNaN(Number(kiloRaw)) ? Number(kiloRaw) : 0;

  // Pallets → stored in the "package" column
  const palletsRaw = field(raw, "number of pallets", "numberofpallets", "pallets", "package");
  const pkg = palletsRaw
    ? /^\d+$/.test(String(palletsRaw).trim())
      ? `${String(palletsRaw).trim()} Pallet${Number(palletsRaw) !== 1 ? "s" : ""}`
      : cleanStr(palletsRaw)
    : "";

  // ── Optional fields (filled in later via the dashboard) ──────────────────
  const cw              = cleanStr(field(raw, "cw", "cw consolidation", "cwconsolidation"));
  const booking         = cleanStr(field(raw, "booking"));
  const vessel          = cleanStr(field(raw, "vessel"));
  const container       = cleanStr(field(raw, "container"));
  const llsInvoice      = cleanStr(field(raw, "lls invoice", "llsinvoice", "invoice lls"));
  const pickUp          = parseDate(field(raw, "pick up", "pickup")) ?? "";
  const ets             = parseDate(field(raw, "ets")) ?? null;
  const eta             = parseDate(field(raw, "eta")) ?? null;
  const requestedDdpEta = parseDate(field(raw, "requested ddp eta", "requestedddpeta")) ?? null;
  // Custom clearance days. Zero is a valid value (no additional clearance days), so use
  // an explicit check instead of `|| 10` which would replace a legitimate 0 with 10.
  const customClearanceRaw = field(raw, "custom clearance", "customclearance");
  const customClearance = customClearanceRaw !== "" && !isNaN(Number(customClearanceRaw))
    ? Math.max(0, Math.round(Number(customClearanceRaw)))
    : 10;

  const rawStatus = cleanStr(field(raw, "status") || "pending pick up");
  const { status, statusNote } = detectStatus(rawStatus);

  const remarks = cleanStr(field(raw, "remarks", "notes", "note", "bemerkung"));

  const explicitId = cleanStr(field(raw, "id"));
  // Use the explicit id if provided (for updates). Otherwise generate a UUID
  // so every new row gets a unique id — data-derived ids collide when rows
  // share key fields, causing upsert to overwrite previous rows.
  const stableId = explicitId || crypto.randomUUID();

  return {
    id: stableId,
    cw,
    lls_reference: cleanStr(field(raw, "lls reference", "llsreference")),
    supplier,
    invoice,
    delivery_note: deliveryNote,
    po,
    part_number: partNumber,
    quantity,
    package: pkg,
    kilo,
    pick_up: pickUp,
    booking,
    vessel,
    container,
    ets,
    eta,
    lls_invoice: llsInvoice,
    requested_ddp_eta: requestedDdpEta,
    status,
    status_note: statusNote,
    last_updated: new Date().toISOString(),
    custom_clearance: customClearance,
    remarks,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Optional API key check — only enforced when WEBHOOK_API_KEY secret is set
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
    const rawRows: Record<string, unknown>[] = Array.isArray(body) ? body : [body as Record<string, unknown>];

    if (rawRows.length === 0) return err("No rows provided");
    if (rawRows.length > 500) return err("Too many rows — max 500 per request");

    const rows = rawRows.map(mapRow);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error, count } = await supabase
      .from("shipments")
      .insert(rows, { count: "exact" });

    if (error) return err(error.message, 500);

    return ok({ success: true, inserted: count ?? rows.length });
  } catch (e) {
    return err(String(e), 500);
  }
});
