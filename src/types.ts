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
  etaKnipping: string;    // e.g. "tba" or an ISO date
  status: ShipmentStatus;
  statusNote: string;     // display text, e.g. "departed 28.04"
  lastUpdated: string;    // ISO date
}
