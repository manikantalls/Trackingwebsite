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

// Case-insensitive, trimmed key lookup supporting multiple aliases
function col(row: Record<string, unknown>, ...keys: string[]): unknown {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), v])
  );
  for (const key of keys) {
    const val = normalized[key.toLowerCase().trim()];
    if (val !== undefined && val !== null && val !== '') return val;
  }
  return '';
}

// Find the header row index by looking for a row containing known column names
function findHeaderRow(rawRows: unknown[][]): number {
  const knownHeaders = ['invoice', 'supplier', 'lls reference', 'vessel', 'container', 'status', 'cw', 'booking'];
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const row = rawRows[i];
    if (!Array.isArray(row)) continue;
    const cellTexts = row.map((c) => String(c ?? '').toLowerCase().trim());
    const matches = knownHeaders.filter((h) => cellTexts.some((c) => c === h));
    if (matches.length >= 3) return i;
  }
  return 0;
}

export function parseExcelFile(file: File): Promise<Shipment[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];

        // Read as raw arrays first to detect header row position
        const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
        const headerIdx = findHeaderRow(rawRows);

        // Re-parse with the correct header row
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
          defval: '',
          range: headerIdx,
        });

        const shipments: Shipment[] = rows.map((row, i) => {
          const rawStatus = String(col(row, 'Status', 'status') ?? '');
          const { status, statusNote } = detectStatus(rawStatus);

          const llsRef = String(col(row, 'LLS Reference', 'LLS-Reference', 'llsReference', 'lls_reference'));
          const invoice = String(col(row, 'Invoice', 'invoice', 'Rechnung', 'rechnung'));

          // Generate a stable ID so re-imports update existing rows
          const stableId = String(col(row, 'ID', 'id') || `${llsRef}-${invoice}-${i}`.replace(/\s+/g, '-'));

          return {
            id: stableId,
            cw: String(col(row, 'CW', 'cw')),
            llsReference: llsRef,
            supplier: String(col(row, 'Supplier', 'supplier')),
            invoice,
            deliveryNote: String(col(row, 'Delivery Note', 'DeliveryNote', 'deliveryNote', 'delivery_note', 'Lieferschein')),
            po: String(col(row, 'PO', 'po', 'Purchase Order', 'purchase_order')),
            partNumber: String(col(row, 'Part Number', 'PartNumber', 'partNumber', 'part_number', 'Teilenummer')),
            quantity: String(col(row, 'Quantity', 'quantity', 'Menge')),
            package: String(col(row, 'Package', 'package', 'Paket')),
            kilo: Number(col(row, 'Kilo', 'kilo', 'Weight', 'weight', 'Gewicht') || 0),
            pickUp: String(col(row, 'Pick up', 'Pick Up', 'Pickup', 'pickup', 'pickUp')),
            booking: String(col(row, 'Booking', 'booking', 'Buchung')),
            vessel: String(col(row, 'Vessel', 'vessel', 'Schiff')),
            container: String(col(row, 'Container', 'container')),
            ets: parseDate(col(row, 'ETS', 'ets')),
            eta: parseDate(col(row, 'ETA', 'eta')),
            etaKnipping: String(col(row, 'ETA Knipping', 'etaKnipping', 'eta_knipping')),
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
  XLSX.writeFile(wb, 'Knipping_Shipments.xlsx');
}
