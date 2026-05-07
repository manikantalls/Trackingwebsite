import { useState, FormEvent } from 'react';
import { X } from 'lucide-react';
import { Shipment, ShipmentStatus } from '../types';

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
  etaKnipping: 'tba',
  status: 'AT_DEPARTURE_PORT',
  statusNote: 'at departure port',
  lastUpdated: new Date().toISOString(),
};

function toLocalDate(iso: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toISOString().split('T')[0];
  } catch {
    return '';
  }
}

function fromLocalDate(d: string) {
  if (!d) return '';
  return new Date(d).toISOString();
}

export default function ShipmentModal({ initial, onSave, onClose }: Props) {
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

  const Field = ({
    label, name, type = 'text', required = false,
  }: { label: string; name: keyof typeof form; type?: string; required?: boolean }) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        required={required}
        value={
          (name === 'ets' || name === 'eta' || name === 'pickUp')
            ? toLocalDate(String(form[name] ?? ''))
            : String(form[name] ?? '')
        }
        onChange={(e) => {
          const v = (name === 'ets' || name === 'eta' || name === 'pickUp')
            ? fromLocalDate(e.target.value)
            : e.target.value;
          set(name, v as never);
        }}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  );

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
                <Field label="CW" name="cw" required />
                <Field label="LLS Reference" name="llsReference" />
                <Field label="Supplier" name="supplier" required />
                <Field label="Invoice" name="invoice" />
                <Field label="Delivery Note" name="deliveryNote" />
                <Field label="PO" name="po" />
                <Field label="Part Number" name="partNumber" required />
                <Field label="Quantity" name="quantity" />
                <Field label="Package" name="package" />
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kilo</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.kilo}
                    onChange={(e) => set('kilo', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </section>

            {/* Shipping Info */}
            <section>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Shipping Information</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Field label="Pick Up" name="pickUp" type="date" />
                <Field label="Booking" name="booking" />
                <Field label="Vessel" name="vessel" />
                <Field label="Container" name="container" />
                <Field label="ETS" name="ets" type="date" />
                <Field label="ETA" name="eta" type="date" />
                <Field label="ETA Knipping" name="etaKnipping" />
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
