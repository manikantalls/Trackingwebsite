import {
  ArrowLeft, Package, Ship, Container, Calendar, MapPin, Hash,
  FileText, ShoppingCart, Weight, Clock, Anchor, CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import { Shipment, ShipmentStatus } from '../types';
import StatusBadge from './StatusBadge';
import DocumentsSection from './DocumentsSection';

interface Props {
  shipment: Shipment;
  onBack: () => void;
}

const JOURNEY: { key: ShipmentStatus; label: string; Icon: React.ElementType }[] = [
  { key: 'AT_DEPARTURE_PORT', label: 'At Departure\nPort', Icon: Anchor },
  { key: 'DEPARTED', label: 'Departed', Icon: Ship },
  { key: 'IN_TRANSIT', label: 'In Transit', Icon: TrendingUp },
  { key: 'ARRIVED', label: 'Arrived', Icon: MapPin },
  { key: 'DELIVERED', label: 'Delivered', Icon: CheckCircle2 },
];

function stepIndex(status: ShipmentStatus) {
  return JOURNEY.findIndex((j) => j.key === status);
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

function fmtUpdated(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
        {icon}
        {label}
      </label>
      <div className="text-sm text-gray-800 font-medium">{value || '—'}</div>
    </div>
  );
}

export default function ShipmentDetail({ shipment: s, onBack }: Props) {
  const activeStep = stepIndex(s.status);

  // Progress: step-based out of 4 (0-indexed max = 4)
  const progressPct = Math.round(((activeStep) / (JOURNEY.length - 1)) * 100);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
          <Package className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-gray-700">Knipping lls Shipment Dashboard</span>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">

        {/* Header card */}
        <div className="bg-gradient-to-r from-blue-50 to-slate-50 border border-blue-100 rounded-2xl px-6 py-5 flex items-start justify-between shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Invoice</span>
              <span className="text-xl font-bold text-blue-600">{s.invoice}</span>
              <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded text-white text-xs font-bold ${s.cw === 'CW17' ? 'bg-blue-600' : s.cw === 'CW18' ? 'bg-teal-600' : 'bg-gray-500'}`}>
                {s.cw}
              </span>
            </div>
            <p className="text-sm text-gray-600">
              <span className="font-medium">{s.supplier}</span>
              <span className="text-gray-400 mx-2">·</span>
              {s.llsReference}
            </p>
            <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
              <Clock className="w-3.5 h-3.5" />
              Last updated: {fmtUpdated(s.lastUpdated)}
            </p>
          </div>
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors font-medium shadow-sm shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
        </div>

        {/* Status + Journey */}
        <div className="bg-white border border-gray-200 rounded-2xl px-6 py-5 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <StatusBadge status={s.status} note={s.statusNote} />
            <span className="text-sm text-gray-500">
              Vessel: <span className="font-semibold text-gray-800">{s.vessel}</span>
            </span>
            <span className="text-sm text-gray-500">
              Container: <span className="font-semibold text-gray-800">{s.container}</span>
            </span>
          </div>

          <h3 className="text-sm font-semibold text-gray-700 mb-6">Shipment Journey</h3>
          <div className="relative flex items-start justify-between px-2">
            {/* background track */}
            <div className="absolute left-2 right-2 top-4 h-0.5 bg-gray-200" />
            {/* filled track */}
            <div
              className="absolute left-2 top-4 h-0.5 bg-blue-600 transition-all duration-700"
              style={{ width: `calc(${progressPct}% - 4px)` }}
            />
            {JOURNEY.map((step, i) => {
              const done = i <= activeStep;
              const active = i === activeStep;
              const Icon = step.Icon;
              return (
                <div key={step.key} className="relative flex flex-col items-center gap-2 z-10" style={{ width: '20%' }}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                    done ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100' : 'bg-white border-gray-200 text-gray-300'
                  } ${active ? 'ring-4 ring-blue-100 scale-110' : ''}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-xs text-center text-gray-500 leading-tight whitespace-pre-line font-medium">{step.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Two-column detail area */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Order Info */}
          <div className="bg-white border border-gray-200 rounded-2xl px-6 py-6 shadow-sm space-y-5">
            <h3 className="text-sm font-semibold text-gray-800">Order Information</h3>
            <Field icon={<Hash className="w-3.5 h-3.5" />} label="LLS Reference" value={s.llsReference} />
            <Field icon={<FileText className="w-3.5 h-3.5" />} label="Invoice" value={s.invoice} />
            <Field icon={<FileText className="w-3.5 h-3.5" />} label="Delivery Note" value={s.deliveryNote} />
            <Field icon={<ShoppingCart className="w-3.5 h-3.5" />} label="Purchase Order (PO)" value={s.po || '—'} />
            <Field icon={<Package className="w-3.5 h-3.5" />} label="Part Number" value={
              <span className="font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs">{s.partNumber}</span>
            } />
            <div className="grid grid-cols-3 gap-4">
              <Field icon={<Package className="w-3.5 h-3.5" />} label="Quantity" value={s.quantity} />
              <Field icon={<Package className="w-3.5 h-3.5" />} label="Package" value={s.package} />
              <Field icon={<Weight className="w-3.5 h-3.5" />} label="Weight (kg)" value={`${s.kilo} kg`} />
            </div>
          </div>

          {/* Shipping Info */}
          <div className="bg-white border border-gray-200 rounded-2xl px-6 py-6 shadow-sm space-y-5">
            <h3 className="text-sm font-semibold text-gray-800">Shipping Information</h3>
            <Field icon={<Calendar className="w-3.5 h-3.5" />} label="Pick Up" value={s.pickUp} />
            <Field icon={<Hash className="w-3.5 h-3.5" />} label="Booking Reference" value={s.booking} />
            <Field icon={<Ship className="w-3.5 h-3.5" />} label="Vessel" value={s.vessel} />
            <Field icon={<Container className="w-3.5 h-3.5" />} label="Container" value={
              <span className="font-mono font-bold text-gray-800">{s.container}</span>
            } />
            <div className="grid grid-cols-3 gap-4">
              <Field icon={<Calendar className="w-3.5 h-3.5" />} label="ETS" value={fmtDate(s.ets)} />
              <Field icon={<Calendar className="w-3.5 h-3.5" />} label="ETA" value={fmtDate(s.eta)} />
              <Field icon={<Calendar className="w-3.5 h-3.5" />} label="ETA Knipping" value={s.etaKnipping} />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
                <TrendingUp className="w-3.5 h-3.5" />
                Journey Progress
              </label>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full transition-all duration-700" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="text-sm font-bold text-gray-700 w-10 text-right">{progressPct}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Documents for this shipment */}
        <DocumentsSection shipmentId={s.id} />

      </div>
    </div>
  );
}
