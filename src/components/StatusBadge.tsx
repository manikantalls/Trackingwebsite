import { ShipmentStatus } from '../types';

interface Props {
  status: ShipmentStatus;
  note?: string;
}

const config: Record<ShipmentStatus, { className: string }> = {
  DEPARTED:           { className: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  AT_DEPARTURE_PORT:  { className: 'bg-sky-100 text-sky-700 border border-sky-200' },
  IN_TRANSIT:         { className: 'bg-amber-100 text-amber-700 border border-amber-200' },
  ARRIVED:            { className: 'bg-teal-100 text-teal-700 border border-teal-200' },
  DELIVERED:          { className: 'bg-gray-100 text-gray-600 border border-gray-200' },
};

export default function StatusBadge({ status, note }: Props) {
  const { className } = config[status];
  const label = note || status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold whitespace-nowrap ${className}`}>
      {label}
    </span>
  );
}
