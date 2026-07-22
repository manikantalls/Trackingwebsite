export type ShipmentStatus =
  | 'AT_DEPARTURE_PORT'
  | 'DEPARTED'
  | 'IN_TRANSIT'
  | 'ARRIVED'
  | 'DELIVERED';

export interface Shipment {
  id: string;
  cw: string;             // Calendar week, e.g. "CW17"
  llsReference: string;   // e.g. "2604/210/0067"
  supplier: string;       // e.g. "KKT Leingarten"
  invoice: string;        // e.g. "6949036"
  deliveryNote: string;   // e.g. "6949036"
  po: string;             // Purchase order number
  partNumber: string;     // e.g. "305082 75 280541 001"
  quantity: string;       // e.g. "2500 PCS" or "1000 KG"
  package: string;        // e.g. "1 Carton"
  kilo: number;           // weight in kg
  pickUp: string;         // pickup date (ISO date string)
  booking: string;        // booking ref, e.g. "459HA1570954"
  vessel: string;         // e.g. "MSC Alicante"
  container: string;      // container number, e.g. "MSNU9565311"
  ets: string;            // Estimated Time of Shipment (ISO date)
  eta: string;            // Estimated Time of Arrival (ISO date)
  llsInvoice: string;     // LLS Invoice Number
  requestedDdpEta: string; // Requested DDP ETA KN-MX (from Excel, ISO date string)
  status: ShipmentStatus;
  statusNote: string;     // display text, e.g. "departed 28.04"
  lastUpdated: string;    // ISO date
  customClearance: number; // days for customs clearance, default 10; used to compute DDP Lead Time = ETA + customClearance
  remarks: string;        // free-text notes per shipment
  alert_sent_at?: string | null; // timestamp of last automatic delay alert, null if not yet sent
}

// Transit Time (days) = ETA - Pickup date. Returns null when either date is missing or invalid.
export function transitTimeDays(pickUp: string, eta: string): number | null {
  if (!pickUp || !eta) return null;
  const p = new Date(pickUp);
  const e = new Date(eta);
  if (isNaN(p.getTime()) || isNaN(e.getTime())) return null;
  return Math.round((e.getTime() - p.getTime()) / 86400000);
}
