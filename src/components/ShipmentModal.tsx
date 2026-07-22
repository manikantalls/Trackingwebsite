import { useState, FormEvent } from 'react';
import { X } from 'lucide-react';
import { Shipment, ShipmentStatus } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  initial?: Shipment;
  onSave: (s: Shipment) => void;
  onClose: () => void;
}

const STATUS_OPTIONS: { value: ShipmentStatus; label: string }[] = [
  { value: 'AT_DEPARTURE_PORT', label: 'At Departure Port' },
  { value: 'DEPARTED', label: 'Departed' },
  { value: 'IN_TRANSIT', label: 'In Transit' },
  { value: 'ARRIVED', label: 'Arrived' },
  { value: 'DELIVERED', label: 'Delivered' },
];

const BLANK: Omit<Shipment, 'id'> = {
  cw: '',
  llsReference: '',
  supplier: '',
  invoice: '',
  deliveryNote: '',
  po: '',
  partNumber: '',
  quantity: '',
  package: '',
  kilo: 0,
  pickUp: '',
  booking: '',
  vessel: '',
  container: '',
  ets: '',
  eta: '',
  llsInvoice: '',
  status: 'AT_DEPARTURE_PORT',
  statusNote: 'at departure port',
  lastUpdated: new Date().toISOString(),
  customClearance: 10,
  remarks: '',
  requestedDdpEta: '',
};

function toLocalDate(iso: string) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '';
  }
}

function fromLocalDate(d: string) {
  if (!d) return '';
  const date = new Date(d + 'T00:00:00');
  return isNaN(date.getTime()) ? '' : date.toISOString();
}

interface FieldProps {
  label: string;
  name?: string;
  type?: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
}

const Field = ({ label, type = 'text', required = false, value, onChange }: FieldProps) => (
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
    <input
      type={type}
      required={required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    />
  </div>
);

export default function ShipmentModal({ initial, onSave, onClose }: Props) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [form, setForm] = useState<Omit<Shipment, 'id'>>(() =>
    initial ? { ...initial } : { ...BLANK }
  );

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const id = initial?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    onSave({ id, ...form, lastUpdated: new Date().toISOString() });
  }

  const dateField = (key: 'ets' | 'eta' | 'pickUp') => ({
    value: toLocalDate(String(form[key] ?? '')),
    onChange: (v: string) => set(key, fromLocalDate(v) as never),
  });

  const textField = (key: keyof typeof form) => ({
    value: String(form[key] ?? ''),
    onChange: (v: string) => set(key, v as never),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 py-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-base font-semibold text-gray-800">
            {initial ? 'Edit Shipment' : 'Add New Shipment'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — scrollable */}
        <form onSubmit={handleSubmit} id="shipment-form" className="overflow-y-auto flex-1">
          <div className="px-6 py-5 space-y-6">

            {/* Order Info */}
            <section>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Order Information</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Field label="CW" name="cw" required {...textField('cw')} />
                <Field label="LLS Reference" name="llsReference" {...textField('llsReference')} />
                <Field label="Supplier" name="supplier" required {...textField('supplier')} />
                <Field label="Invoice" name="invoice" {...textField('invoice')} />
                <Field label="Delivery Note" name="deliveryNote" {...textField('deliveryNote')} />
                <Field label="PO" name="po" {...textField('po')} />
                <Field label="Part Number" name="partNumber" required {...textField('partNumber')} />
                <Field label="Quantity" name="quantity" {...textField('quantity')} />
                <Field label="Package" name="package" {...textField('package')} />
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kilo</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.kilo}
                    onChange={(e) => set('kilo', Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </section>

            {/* Shipping Info */}
            <section>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Shipping Information</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Field label="Pick Up" name="pickUp" type="date" {...dateField('pickUp')} />
                <Field label="Booking" name="booking" {...textField('booking')} />
                <Field label="Vessel" name="vessel" {...textField('vessel')} />
                <Field label="Container" name="container" {...textField('container')} />
                <Field label="ETS" name="ets" type="date" {...dateField('ets')} />
                <Field label="ETA" name="eta" type="date" {...dateField('eta')} />
                <Field label="Invoice LLS" name="llsInvoice" {...textField('llsInvoice')} />
                {isAdmin && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      DDP Lead Time (Days)
                      <span className="ml-1.5 text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded uppercase tracking-wide">Admin</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={form.customClearance ?? 10}
                      onChange={(e) => set('customClearance', Math.max(0, Number(e.target.value)))}
                      className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50/30"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">DDP ETA KN-MX = ETA + this many days</p>
                  </div>
                )}
              </div>
            </section>

            {/* Status */}
            <section>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Status</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => {
                      const s = e.target.value as ShipmentStatus;
                      const opt = STATUS_OPTIONS.find((o) => o.value === s);
                      set('status', s);
                      set('statusNote', opt?.label.toLowerCase() ?? '');
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status Note (display text)</label>
                  <input
                    value={form.statusNote}
                    onChange={(e) => set('statusNote', e.target.value)}
                    placeholder="e.g. departed 28.04"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </section>

            {/* Remarks */}
            <section>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Remarks</h4>
              <textarea
                value={form.remarks}
                onChange={(e) => set('remarks', e.target.value)}
                rows={3}
                placeholder="Add any notes or remarks about this shipment…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
              />
            </section>

          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button form="shipment-form" type="submit" className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
            {initial ? 'Save Changes' : 'Add Shipment'}
          </button>
        </div>
      </div>
    </div>
  );
}
