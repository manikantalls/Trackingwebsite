import * as XLSX from 'xlsx';
import { Shipment, ShipmentStatus } from '../types';

function detectStatus(raw: string): { status: ShipmentStatus; statusNote: string } {
  const lower = raw.toLowerCase().trim();
  let status: ShipmentStatus = 'AT_DEPARTURE_PORT';
  if (lower.includes('deliver')) status = 'DELIVERED';
  else if (lower.includes('arriv')) status = 'ARRIVED';
  else if (lower.includes('in transit') || lower.includes('transit')) status = 'IN_TRANSIT';
  else if (lower.includes('depart')) status = 'DEPARTED';
  else if (lower.includes('at departure') || lower.includes('departure port') || lower.includes('port')) status = 'AT_DEPARTURE_PORT';
  return { status, statusNote: raw || '' };
}

function parseDate(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    return new Date(d.y, d.m - 1, d.d).toISOString();
  }
  const str = String(val).trim();
  // Support DD.MM.YYYY
  const dmY = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmY) return new Date(+dmY[3], +dmY[2] - 1, +dmY[1]).toISOString();
  const d = new Date(str);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

export function parseExcelFile(file: File): Promise<Shipment[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

        const shipments: Shipment[] = rows.map((row, i) => {
          const rawStatus = String(row['Status'] ?? row['status'] ?? '');
          const { status, statusNote } = detectStatus(rawStatus);

          return {
            id: String(row['ID'] ?? row['id'] ?? `imp-${Date.now()}-${i}`),
            cw: String(row['CW'] ?? row['cw'] ?? ''),
            llsReference: String(row['LLS Reference'] ?? row['llsReference'] ?? ''),
            supplier: String(row['Supplier'] ?? row['supplier'] ?? ''),
            invoice: String(row['Invoice'] ?? row['invoice'] ?? ''),
            deliveryNote: String(row['Delivery Note'] ?? row['deliveryNote'] ?? ''),
            po: String(row['PO'] ?? row['po'] ?? ''),
            partNumber: String(row['Part Number'] ?? row['partNumber'] ?? ''),
            quantity: String(row['Quantity'] ?? row['quantity'] ?? ''),
            package: String(row['Package'] ?? row['package'] ?? ''),
            kilo: Number(row['Kilo'] ?? row['kilo'] ?? 0),
            pickUp: String(row['Pick up'] ?? row['pickUp'] ?? row['Pickup'] ?? ''),
            booking: String(row['Booking'] ?? row['booking'] ?? ''),
            vessel: String(row['Vessel'] ?? row['vessel'] ?? ''),
            container: String(row['Container'] ?? row['container'] ?? ''),
            ets: parseDate(row['ETS'] ?? row['ets']),
            eta: parseDate(row['ETA'] ?? row['eta']),
            etaKnipping: String(row['ETA Knipping'] ?? row['etaKnipping'] ?? ''),
            status,
            statusNote,
            lastUpdated: new Date().toISOString(),
          };
        });

        resolve(shipments);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function exportToExcel(shipments: Shipment[]): void {
  const rows = shipments.map((s) => ({
    ID: s.id,
    CW: s.cw,
    'LLS Reference': s.llsReference,
    Supplier: s.supplier,
    Invoice: s.invoice,
    'Delivery Note': s.deliveryNote,
    PO: s.po,
    'Part Number': s.partNumber,
    Quantity: s.quantity,
    Package: s.package,
    Kilo: s.kilo,
    'Pick up': s.pickUp,
    Booking: s.booking,
    Vessel: s.vessel,
    Container: s.container,
    ETS: s.ets ? new Date(s.ets).toLocaleDateString('de-DE') : '',
    ETA: s.eta ? new Date(s.eta).toLocaleDateString('de-DE') : '',
    'ETA Knipping': s.etaKnipping,
    Status: s.statusNote || s.status,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Shipments');
  XLSX.writeFile(wb, 'EFTEC_Shipments.xlsx');
}
