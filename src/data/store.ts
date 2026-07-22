import { supabase } from '../lib/supabase';
import { Shipment } from '../types';

function toRow(s: Shipment): Record<string, unknown> {
  return {
    id: s.id,
    cw: s.cw,
    lls_reference: s.llsReference,
    supplier: s.supplier,
    invoice: s.invoice,
    delivery_note: s.deliveryNote,
    po: s.po,
    part_number: s.partNumber,
    quantity: s.quantity,
    package: s.package,
    kilo: (isNaN(s.kilo) || s.kilo == null) ? 0 : s.kilo,
    pick_up: s.pickUp,
    booking: s.booking,
    vessel: s.vessel,
    container: s.container,
    ets: s.ets || null,
    eta: s.eta || null,
    lls_invoice: s.llsInvoice,
    requested_ddp_eta: s.requestedDdpEta || null,
    status: s.status,
    status_note: s.statusNote,
    last_updated: s.lastUpdated,
    custom_clearance: s.customClearance ?? 10,
    remarks: s.remarks ?? '',
  };
}

function fromRow(r: Record<string, unknown>): Shipment {
  return {
    id: String(r.id ?? ''),
    cw: String(r.cw ?? ''),
    llsReference: String(r.lls_reference ?? ''),
    supplier: String(r.supplier ?? ''),
    invoice: String(r.invoice ?? ''),
    deliveryNote: String(r.delivery_note ?? ''),
    po: String(r.po ?? ''),
    partNumber: String(r.part_number ?? ''),
    quantity: String(r.quantity ?? ''),
    package: String(r.package ?? ''),
    kilo: Number(r.kilo ?? 0),
    pickUp: String(r.pick_up ?? ''),
    booking: String(r.booking ?? ''),
    vessel: String(r.vessel ?? ''),
    container: String(r.container ?? ''),
    ets: r.ets ? String(r.ets) : '',
    eta: r.eta ? String(r.eta) : '',
    llsInvoice: String(r.lls_invoice ?? ''),
    requestedDdpEta: r.requested_ddp_eta ? String(r.requested_ddp_eta) : '',
    status: (r.status as Shipment['status']) ?? 'AT_DEPARTURE_PORT',
    statusNote: String(r.status_note ?? ''),
    lastUpdated: String(r.last_updated ?? new Date().toISOString()),
    customClearance: Number(r.custom_clearance ?? 10),
    remarks: String(r.remarks ?? ''),
  };
}

function dbError(error: { message?: string; details?: string; hint?: string } | null): Error {
  const parts = [error?.message, error?.details, error?.hint].filter(Boolean);
  return new Error(parts.join(' — ') || 'Database error');
}

export async function fetchShipments(): Promise<Shipment[]> {
  const { data, error } = await supabase
    .from('shipments')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw dbError(error);
  return (data ?? []).map((r) => fromRow(r as Record<string, unknown>));
}

export async function upsertShipment(s: Shipment): Promise<void> {
  const { error } = await supabase
    .from('shipments')
    .upsert(toRow(s), { onConflict: 'id' });
  if (error) throw dbError(error);
}

export async function replaceAllShipments(shipments: Shipment[]): Promise<void> {
  const { error: delError } = await supabase.from('shipments').delete().neq('id', '');
  if (delError) throw dbError(delError);
  if (shipments.length === 0) return;
  const { error } = await supabase.from('shipments').insert(shipments.map(toRow));
  if (error) throw dbError(error);
}

export async function upsertShipments(shipments: Shipment[]): Promise<void> {
  const { error } = await supabase
    .from('shipments')
    .upsert(shipments.map(toRow), { onConflict: 'id' });
  if (error) throw dbError(error);
}

export async function deleteShipment(id: string): Promise<void> {
  const { error } = await supabase.from('shipments').delete().eq('id', id);
  if (error) throw dbError(error);
}

export async function deleteShipments(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const BATCH = 50;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const { error } = await supabase.from('shipments').delete().in('id', chunk);
    if (error) throw dbError(error);
  }
}
