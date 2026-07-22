import { ArrowLeft, Package, Weight, Hash, Layers, Ship } from 'lucide-react';
import { Shipment, transitTimeDays } from '../types';
import StatusBadge from './StatusBadge';

interface Props {
  partNumber: string;
  shipments: Shipment[];
  onBack: () => void;
  onViewShipment: (id: string) => void;
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function ddpLeadTime(eta: string, days: number): string {
  if (!eta) return '—';
  const d = new Date(eta);
  if (isNaN(d.getTime())) return '—';
  d.setDate(d.getDate() + (days ?? 10));
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function ddpDeviation(customClearance: number | undefined): string {
  const diff = (customClearance ?? 10) - 10;
  if (diff === 0) return '0';
  return diff > 0 ? `+${diff}` : `${diff}`;
}

export default function PartNumberDetail({ partNumber, shipments, onBack, onViewShipment }: Props) {
  const totalKg = shipments.reduce((sum, s) => sum + (s.kilo || 0), 0);
  const totalPieces = shipments.reduce((sum, s) => {
    const n = parseInt(s.quantity);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);
  const suppliers = Array.from(new Set(shipments.map((s) => s.supplier).filter(Boolean)));
  const vessels = Array.from(new Set(shipments.map((s) => s.vessel).filter(Boolean)));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <img src="/logo.png" alt="Knipping Logo" className="h-28 w-auto object-contain" />
        <span className="text-base font-semibold text-gray-700">Knipping LLS Dashboard</span>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-50 to-slate-50 border border-emerald-100 rounded-2xl px-6 py-5 flex items-start justify-between shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Part Number</span>
            </div>
            <h1 className="text-2xl font-bold font-mono text-gray-900">{partNumber}</h1>
            {suppliers.length > 0 && (
              <p className="text-sm text-gray-500 mt-1">{suppliers.join(', ')}</p>
            )}
            {vessels.length > 0 && (
              <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-1">
                <Ship className="w-3.5 h-3.5" />
                {vessels.join(', ')}
              </p>
            )}
          </div>
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors font-medium shadow-sm shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label="Shipments" value={shipments.length.toString()} icon={<Package className="w-4 h-4 text-emerald-500" />} />
          <StatCard label="Total Weight" value={`${totalKg.toLocaleString()} kg`} icon={<Weight className="w-4 h-4 text-teal-500" />} />
          <StatCard label="Total Pieces" value={totalPieces > 0 ? totalPieces.toLocaleString() : '—'} icon={<Hash className="w-4 h-4 text-amber-500" />} />
        </div>

        {/* Shipments table */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Shipments for this part number</h2>
            <span className="text-xs text-gray-400">{shipments.length} item{shipments.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['CW Consolidation', 'LLS Reference', 'Supplier', 'Invoice Spl', 'Delivery Note', 'PO', 'Quantity', 'Package', 'Weight (kg)', 'Container', 'Pick Up', 'ETS', 'ETA', 'Transit Time (Days)', 'DDP ETA KN-MX', 'Requested DDP ETA KN-MX', 'DDP ETA Deviation (Days)', 'Status', 'Remarks', 'Invoice LLS'].map((h, i) => (
                    <th key={i} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 tracking-wide border-r border-gray-100 last:border-r-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {shipments.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => onViewShipment(s.id)}
                    className="hover:bg-emerald-50/40 transition-colors cursor-pointer"
                  >
                    <td className="px-3 py-2.5 border-r border-gray-50">
                      <span className="text-gray-700">{s.cw.replace(/^CW/i, '')}</span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700 font-medium border-r border-gray-50">{s.llsReference}</td>
                    <td className="px-3 py-2.5 text-gray-700 border-r border-gray-50">{s.supplier}</td>
                    <td className="px-3 py-2.5 text-gray-600 border-r border-gray-50">{s.invoice}</td>
                    <td className="px-3 py-2.5 text-gray-600 border-r border-gray-50">{s.deliveryNote}</td>
                    <td className="px-3 py-2.5 text-gray-600 border-r border-gray-50">{s.po || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600 border-r border-gray-50">{s.quantity}</td>
                    <td className="px-3 py-2.5 text-gray-600 border-r border-gray-50">{s.package}</td>
                    <td className="px-3 py-2.5 text-gray-700 font-semibold border-r border-gray-50 text-right">{s.kilo.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-gray-700 font-medium border-r border-gray-50">{s.container}</td>
                    <td className="px-3 py-2.5 text-gray-600 border-r border-gray-50">{fmtDate(s.pickUp)}</td>
                    <td className="px-3 py-2.5 text-gray-600 border-r border-gray-50">{fmtDate(s.ets)}</td>
                    <td className="px-3 py-2.5 text-gray-600 border-r border-gray-50">{fmtDate(s.eta)}</td>
                    <td className={`px-3 py-2.5 border-r border-gray-50 text-center font-medium ${(() => { const tt = transitTimeDays(s.pickUp, s.eta); return tt !== null && tt > 42 ? 'text-red-600 bg-red-50' : 'text-gray-600'; })()}`}>{(() => { const tt = transitTimeDays(s.pickUp, s.eta); return tt === null ? '—' : tt; })()}</td>
                    <td className="px-3 py-2.5 text-gray-600 border-r border-gray-50">{ddpLeadTime(s.eta, s.customClearance ?? 10)}</td>
                    <td className="px-3 py-2.5 text-gray-600 border-r border-gray-50">{s.requestedDdpEta ? fmtDate(s.requestedDdpEta) : '—'}</td>
                    <td className={`px-3 py-2.5 border-r border-gray-50 text-center font-medium ${(() => { const d = (s.customClearance ?? 10) - 10; return d > 5 ? 'text-red-600' : d > 0 ? 'text-orange-500' : 'text-emerald-600'; })()}`}>{ddpDeviation(s.customClearance)}</td>
                    <td className="px-3 py-2.5 border-r border-gray-50">
                      <StatusBadge status={s.status} note={s.statusNote} />
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 border-r border-gray-50 max-w-[240px] truncate" title={s.remarks || ''}>{s.remarks || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600">{s.llsInvoice || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between text-xs text-gray-400">
            <span>{shipments.length} shipment{shipments.length !== 1 ? 's' : ''}</span>
            <span className="font-semibold text-gray-600">{totalKg.toLocaleString()} kg total</span>
          </div>
        </div>

      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm flex items-center gap-3.5">
      <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-base font-bold text-gray-900 leading-tight">{value}</p>
      </div>
    </div>
  );
}
