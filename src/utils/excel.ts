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

// Case-insensitive, trimmed key lookup supporting multiple aliases.
// Normalises spaces, underscores, and hyphens so "Invoice Spl", "Invoice_Spl",
// "Invoice-Spl" all match. Also tries both word orders ("Spl Invoice" ↔ "Invoice Spl").
function col(row: Record<string, unknown>, ...keys: string[]): unknown {
  const norm = (s: string) => s.toLowerCase().trim().replace(/[\s_-]+/g, '');
  const normalized = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [norm(k), v])
  );
  for (const key of keys) {
    const val = normalized[norm(key)];
    if (val !== undefined && val !== null && val !== '') return val;
  }
  return '';
}

// Find the header row index by looking for a row containing known column names
function findHeaderRow(rawRows: unknown[][]): number {
  const knownHeaders = [
    'invoice', 'invoice spl', 'spl invoice', 'supplier', 'lls reference', 'vessel', 'container', 'status',
    'cw', 'cw consolidation', 'booking', 'part number', 'delivery note',
  ];
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const row = rawRows[i];
    if (!Array.isArray(row)) continue;
    const cellTexts = row.map((c) => String(c ?? '').toLowerCase().trim());
    const matches = knownHeaders.filter((h) => cellTexts.some((c) => c === h));
    if (matches.length >= 3) return i;
  }
  return 0;
}

const MAX_FILE_SIZE_MB = 10;
const MAX_ROWS = 5000;

export function parseExcelFile(file: File): Promise<Shipment[]> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return reject(new Error(`File is too large. Maximum allowed size is ${MAX_FILE_SIZE_MB} MB.`));
    }

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
        const allRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
          defval: '',
          range: headerIdx,
        });

        if (allRows.length > MAX_ROWS) {
          return reject(new Error(`Too many rows. Maximum allowed is ${MAX_ROWS} rows per import.`));
        }

        if (allRows.length === 0) {
          return reject(new Error('The file appears to be empty — no data rows were found after the header.'));
        }

        // Validate that at least some known columns were found
        const knownHeaders = ['invoice', 'invoice spl', 'spl invoice', 'supplier', 'lls reference', 'vessel', 'container', 'status', 'cw', 'booking', 'part number', 'delivery note'];
        const detectedCols = Object.keys(allRows[0] ?? {}).map((k) => k.toLowerCase().trim());
        const matchedCols = knownHeaders.filter((h) => detectedCols.some((c) => c === h));
        if (matchedCols.length < 2) {
          const shown = detectedCols.slice(0, 10).join('", "');
          return reject(new Error(
            `Header row not recognised. Expected columns like "Invoice", "Supplier", "LLS Reference", "Vessel", "Container", "Status", "CW", etc.\n\nColumns found in your file: "${shown || 'none'}"`
          ));
        }

        const rows = allRows;

        // Count truly duplicate rows (same computed ID before the |dup suffix)
        const rawIdCounts = new Map<string, number>();
        rows.forEach((row) => {
          const cw      = String(col(row, 'CW Consolidation', 'CW', 'cw consolidation', 'cw', 'KW', 'kw'));
          const llsRef  = String(col(row, 'LLS Reference', 'LLS-Reference', 'llsReference', 'lls_reference'));
          const invoice = String(col(row, 'Invoice Spl', 'Spl Invoice', 'Invoice', 'invoice spl', 'spl invoice', 'invoice', 'Rechnung', 'rechnung'));
          const pn      = String(col(row, 'Part Number', 'PartNumber', 'partNumber', 'part_number', 'Teilenummer'));
          const explicitId = String(col(row, 'ID', 'id') || '');
          const key = explicitId || [cw, llsRef, invoice, pn].join('|').trim();
          rawIdCounts.set(key, (rawIdCounts.get(key) ?? 0) + 1);
        });
        const dupCount = Array.from(rawIdCounts.values()).filter((c) => c > 1).reduce((sum, c) => sum + (c - 1), 0);

        const seenIds = new Map<string, number>();

        const shipments: Shipment[] = rows.map((row) => {
          const rawStatus = String(col(row, 'Status', 'status') ?? '');
          const { status, statusNote } = detectStatus(rawStatus);

          const cw           = String(col(row, 'CW Consolidation', 'CW', 'cw consolidation', 'cw', 'KW', 'kw'));
          const llsRef       = String(col(row, 'LLS Reference', 'LLS-Reference', 'llsReference', 'lls_reference'));
          const supplier     = String(col(row, 'Supplier', 'supplier'));
          const invoice      = String(col(row, 'Spl Invoice', 'Invoice Spl', 'Invoice', 'invoice spl', 'spl invoice', 'invoice', 'Rechnung', 'rechnung'));
          const deliveryNote = String(col(row, 'Delivery Note', 'DeliveryNote', 'deliveryNote', 'delivery_note', 'Lieferschein'));
          const po           = String(col(row, 'PO', 'po', 'Purchase Order', 'purchase_order'));
          const partNumber   = String(col(row, 'Part Number', 'PartNumber', 'partNumber', 'part_number', 'Teilenummer'));
          const quantity     = String(col(row, 'Quantity', 'quantity', 'Menge'));
          const pkg          = String(col(row, 'Package', 'package', 'Paket'));
          const kilo         = Number(col(row, 'Kilo', 'kilo', 'Weight', 'weight', 'Gewicht') || 0);
          const pickUp       = parseDate(col(row, 'Pick up', 'Pick Up', 'Pickup', 'pickup', 'pickUp'));
          const booking      = String(col(row, 'Booking', 'booking', 'Buchung'));
          const vessel       = String(col(row, 'Vessel', 'vessel', 'Schiff'));
          const container    = String(col(row, 'Container', 'container'));
          const ets          = parseDate(col(row, 'ETS', 'ets'));
          const eta          = parseDate(col(row, 'ETA', 'eta'));
          const llsInvoice        = String(col(row, 'Invoice LLS', 'LLS Invoice Number', 'LLS Invoice', 'lls_invoice', 'llsInvoice'));
          const requestedDdpEta   = parseDate(col(row, 'Requested DDP ETA KN-MX', 'Requested DDP ETA', 'requested_ddp_eta', 'requestedDdpEta'));
          const remarks          = String(col(row, 'Remarks', 'remarks', 'Notes', 'notes', 'Bemerkung', 'bemerkung'));

          // Stable ID derived from all content columns — identical rows always get the same ID,
          // so re-importing the same sheet upserts instead of inserting duplicates.
          const explicitId = String(col(row, 'ID', 'id') || '');
          const baseId = explicitId || [
            cw, llsRef, supplier, invoice, deliveryNote, po, partNumber,
            quantity, pkg, String(kilo), booking, llsInvoice,
          ].join('|').replace(/\s+/g, ' ').trim();
          const count = seenIds.get(baseId) ?? 0;
          seenIds.set(baseId, count + 1);
          const stableId = count === 0 ? baseId : `${baseId}|dup${count}`;

          return {
            id: stableId,
            cw,
            llsReference: llsRef,
            supplier,
            invoice,
            deliveryNote,
            po,
            partNumber,
            quantity,
            package: pkg,
            kilo,
            pickUp,
            booking,
            vessel,
            container,
            ets,
            eta,
            llsInvoice,
            requestedDdpEta,
            remarks,
            status,
            statusNote,
            lastUpdated: new Date().toISOString(),
            customClearance: 10,
          };
        });

        // Attach duplicate warning to the array so the caller can surface it
        const result = shipments as Shipment[] & { duplicateWarning?: string };
        if (dupCount > 0) {
          result.duplicateWarning = `${dupCount} duplicate row${dupCount > 1 ? 's' : ''} detected in the file — they were imported with a suffix to avoid overwriting each other.`;
        }
        resolve(result);
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
    'DDP ETA KN-MX': (() => {
      if (!s.eta) return '';
      const d = new Date(s.eta);
      if (isNaN(d.getTime())) return '';
      d.setDate(d.getDate() + (s.customClearance ?? 10));
      return d.toLocaleDateString('de-DE');
    })(),
    'Requested DDP ETA KN-MX': s.requestedDdpEta ? new Date(s.requestedDdpEta).toLocaleDateString('de-DE') : '',
    'DDP ETA Deviation (Days)': (s.customClearance ?? 10) - 10,
    Status: s.statusNote || s.status,
    'Invoice LLS': s.llsInvoice,
    Remarks: s.remarks || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Shipments');
  XLSX.writeFile(wb, 'Knipping_Shipments.xlsx');
}
