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
    kilo: s.kilo,
    pick_up: s.pickUp,
    booking: s.booking,
    vessel: s.vessel,
    container: s.container,
    ets: s.ets || null,
    eta: s.eta || null,
    eta_knipping: s.etaKnipping,
    status: s.status,
    status_note: s.statusNote,
    last_updated: s.lastUpdated,
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
    etaKnipping: String(r.eta_knipping ?? ''),
    status: (r.status as Shipment['status']) ?? 'AT_DEPARTURE_PORT',
    statusNote: String(r.status_note ?? ''),
    lastUpdated: String(r.last_updated ?? new Date().toISOString()),
  };
}

export async function fetchShipments(): Promise<Shipment[]> {
  const { data, error } = await supabase
    .from('shipments')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => fromRow(r as Record<string, unknown>));
}

export async function upsertShipment(s: Shipment): Promise<void> {
  const { error } = await supabase
    .from('shipments')
    .upsert(toRow(s), { onConflict: 'id' });
  if (error) throw error;
}

export async function replaceAllShipments(shipments: Shipment[]): Promise<void> {
  // Delete all existing shipments then insert fresh to avoid stale rows
  const { error: delError } = await supabase.from('shipments').delete().neq('id', '');
  if (delError) throw delError;
  if (shipments.length === 0) return;
  const { error } = await supabase.from('shipments').insert(shipments.map(toRow));
  if (error) throw error;
}

export async function upsertShipments(shipments: Shipment[]): Promise<void> {
  const { error } = await supabase
    .from('shipments')
    .upsert(shipments.map(toRow), { onConflict: 'id' });
  if (error) throw error;
}

export async function deleteShipment(id: string): Promise<void> {
  const { error } = await supabase.from('shipments').delete().eq('id', id);
  if (error) throw error;
}
