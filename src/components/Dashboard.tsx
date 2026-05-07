import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Search, Filter, Upload, Download, Package, ChevronDown, ChevronRight,
  Plus, Trash2, Pencil, Users, LogOut, Shield, User, RefreshCw, X, Layers,
} from 'lucide-react';
import { Shipment, ShipmentStatus } from '../types';
import { fetchShipments, upsertShipment, replaceAllShipments, deleteShipment } from '../data/store';
import { parseExcelFile, exportToExcel } from '../utils/excel';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from './StatusBadge';
import ShipmentModal from './ShipmentModal';

interface Props {
  onView: (id: string) => void;
  onViewContainer: (container: string) => void;
  onUserManagement: () => void;
}

type StatusFilter = 'ALL' | ShipmentStatus;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All Status' },
  { value: 'AT_DEPARTURE_PORT', label: 'At Departure Port' },
  { value: 'DEPARTED', label: 'Departed' },
  { value: 'IN_TRANSIT', label: 'In Transit' },
  { value: 'ARRIVED', label: 'Arrived' },
  { value: 'DELIVERED', label: 'Delivered' },
];

export default function Dashboard({ onView, onViewContainer, onUserManagement }: Props) {
  const { profile, signOut } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [cwFilter, setCwFilter] = useState('ALL');
  const [vesselFilter, setVesselFilter] = useState('ALL');
  const [statusOpen, setStatusOpen] = useState(false);
  const [cwOpen, setCwOpen] = useState(false);
  const [vesselOpen, setVesselOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [editTarget, setEditTarget] = useState<Shipment | null | 'new'>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [groupByContainer, setGroupByContainer] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const fileRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const cwRef = useRef<HTMLDivElement>(null);
  const vesselRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoadingData(true);
    try {
      const data = await fetchShipments();
      setShipments(data);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
      if (cwRef.current && !cwRef.current.contains(e.target as Node)) setCwOpen(false);
      if (vesselRef.current && !vesselRef.current.contains(e.target as Node)) setVesselOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchFocused(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const allCWs = Array.from(new Set(shipments.map((s) => s.cw))).sort();
  const allVessels = Array.from(new Set(shipments.map((s) => s.vessel))).sort();

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 1) return [];
    const seen = new Set<string>();
    const results: { label: string; value: string }[] = [];
    const add = (label: string, value: string) => {
      const key = `${label}:${value}`;
      if (value && value.toLowerCase().includes(q) && !seen.has(key)) {
        seen.add(key);
        results.push({ label, value });
      }
    };
    for (const s of shipments) {
      add('LLS Ref', s.llsReference);
      add('Invoice', s.invoice);
      add('Delivery Note', s.deliveryNote);
      add('PO', s.po);
      add('Booking', s.booking);
      add('Container', s.container);
      add('Supplier', s.supplier);
      add('Part Number', s.partNumber);
      add('Vessel', s.vessel);
      add('CW', s.cw);
    }
    return results.slice(0, 8);
  }, [query, shipments]);

  const filtered = shipments.filter((s) => {
    const q = query.toLowerCase();
    const matchQ =
      !q ||
      s.cw.toLowerCase().includes(q) ||
      s.llsReference.toLowerCase().includes(q) ||
      s.supplier.toLowerCase().includes(q) ||
      s.invoice.toLowerCase().includes(q) ||
      s.deliveryNote.toLowerCase().includes(q) ||
      s.po.toLowerCase().includes(q) ||
      s.partNumber.toLowerCase().includes(q) ||
      s.vessel.toLowerCase().includes(q) ||
      s.container.toLowerCase().includes(q) ||
      s.booking.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'ALL' || s.status === statusFilter;
    const matchCW = cwFilter === 'ALL' || s.cw === cwFilter;
    const matchVessel = vesselFilter === 'ALL' || s.vessel === vesselFilter;
    return matchQ && matchStatus && matchCW && matchVessel;
  });

  const grouped = useMemo(() => {
    const map = new Map<string, Shipment[]>();
    for (const s of filtered) {
      const key = s.container || '(no container)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    if (!isAdmin) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError('');
    try {
      const imported = await parseExcelFile(file);
      await replaceAllShipments(imported);
      await load();
    } catch {
      setImportError('Failed to parse file. Check column headers and try again.');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleSave(s: Shipment) {
    await upsertShipment(s);
    setEditTarget(null);
    await load();
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this shipment? This cannot be undone.')) return;
    setDeletingId(id);
    await deleteShipment(id);
    setDeletingId(null);
    await load();
  }

  function fmtDate(iso: string) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  }

  const cwPalette = ['bg-blue-600', 'bg-teal-600', 'bg-rose-600', 'bg-amber-600', 'bg-emerald-600'];
  const cwColors: Record<string, string> = {};
  allCWs.forEach((cw, i) => { cwColors[cw] = cwPalette[i % cwPalette.length]; });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-tight">Knipping- LLS Dashboard</h1>
            <p className="text-xs text-gray-400">Monitor all your shipments</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* User info */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl mr-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${isAdmin ? 'bg-blue-600' : 'bg-gray-400'}`}>
              {(profile?.full_name || profile?.email || '?').charAt(0).toUpperCase()}
            </div>
            <div className="text-xs">
              <p className="font-semibold text-gray-800 leading-none">{profile?.full_name || profile?.email}</p>
              <p className={`mt-0.5 flex items-center gap-1 ${isAdmin ? 'text-blue-600' : 'text-gray-400'}`}>
                {isAdmin ? <Shield className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
                {profile?.role}
              </p>
            </div>
          </div>

          {isAdmin && (
            <button
              onClick={onUserManagement}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Users className="w-4 h-4" />
              Users
            </button>
          )}

          <button
            onClick={() => exportToExcel(shipments)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>

          {isAdmin && (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={importing}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                {importing ? 'Importing…' : 'Import'}
              </button>
              <button
                onClick={() => setEditTarget('new')}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </>
          )}

          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />

          <button
            onClick={signOut}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="px-6 py-5">
        {importError && (
          <div className="mb-4 px-4 py-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">
            {importError}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div ref={searchRef} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
            <input
              type="text"
              placeholder="Search LLS ref, invoice, delivery note, PO, booking, container…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSuggestionIndex(-1); }}
              onFocus={() => setSearchFocused(true)}
              onKeyDown={(e) => {
                if (!suggestions.length) return;
                if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestionIndex((i) => Math.min(i + 1, suggestions.length - 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestionIndex((i) => Math.max(i - 1, -1)); }
                else if (e.key === 'Enter' && suggestionIndex >= 0) { e.preventDefault(); setQuery(suggestions[suggestionIndex].value); setSearchFocused(false); setSuggestionIndex(-1); }
                else if (e.key === 'Escape') { setSearchFocused(false); setSuggestionIndex(-1); }
              }}
              className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 w-80"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setSuggestionIndex(-1); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {searchFocused && suggestions.length > 0 && (
              <div className="absolute left-0 top-full mt-1 w-full min-w-[320px] bg-white border border-gray-200 rounded-xl shadow-xl z-40 py-1.5 overflow-hidden">
                <p className="px-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Suggestions</p>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setQuery(s.value); setSearchFocused(false); setSuggestionIndex(-1); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${i === suggestionIndex ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  >
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500 shrink-0 min-w-[70px] justify-center">
                      {s.label}
                    </span>
                    <span className="text-gray-800 truncate">{s.value}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <DropdownFilter
            ref={cwRef}
            open={cwOpen}
            onToggle={() => { setCwOpen((o) => !o); setStatusOpen(false); setVesselOpen(false); }}
            label={cwFilter === 'ALL' ? 'All CW' : cwFilter}
          >
            <DropItem active={cwFilter === 'ALL'} onClick={() => { setCwFilter('ALL'); setCwOpen(false); }}>All CW</DropItem>
            {allCWs.map((cw) => (
              <DropItem key={cw} active={cwFilter === cw} onClick={() => { setCwFilter(cw); setCwOpen(false); }}>{cw}</DropItem>
            ))}
          </DropdownFilter>

          <DropdownFilter
            ref={vesselRef}
            open={vesselOpen}
            onToggle={() => { setVesselOpen((o) => !o); setStatusOpen(false); setCwOpen(false); }}
            label={vesselFilter === 'ALL' ? 'All Vessels' : vesselFilter}
          >
            <DropItem active={vesselFilter === 'ALL'} onClick={() => { setVesselFilter('ALL'); setVesselOpen(false); }}>All Vessels</DropItem>
            {allVessels.map((v) => (
              <DropItem key={v} active={vesselFilter === v} onClick={() => { setVesselFilter(v); setVesselOpen(false); }}>{v}</DropItem>
            ))}
          </DropdownFilter>

          <DropdownFilter
            ref={statusRef}
            open={statusOpen}
            onToggle={() => { setStatusOpen((o) => !o); setCwOpen(false); setVesselOpen(false); }}
            label={STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? 'All Status'}
            icon={<Filter className="w-3.5 h-3.5 text-gray-400" />}
          >
            {STATUS_OPTIONS.map((opt) => (
              <DropItem key={opt.value} active={statusFilter === opt.value} onClick={() => { setStatusFilter(opt.value); setStatusOpen(false); }}>
                {opt.label}
              </DropItem>
            ))}
          </DropdownFilter>

          <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600 transition-colors" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => { setGroupByContainer((v) => !v); setCollapsedGroups(new Set()); }}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors font-medium ${groupByContainer ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
            title="Group by container"
          >
            <Layers className="w-3.5 h-3.5" />
            Group by Container
          </button>

          <span className="ml-auto text-xs text-gray-400">
            {filtered.length} of {shipments.length} rows
          </span>
        </div>

        {/* Container card grid */}
        {groupByContainer ? (
          loadingData ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading shipments…</div>
          ) : grouped.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">No shipments match your filters.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {grouped.map(([containerKey, rows]) => {
                const totalKg = rows.reduce((sum, r) => sum + (r.kilo || 0), 0);
                const totalPieces = rows.reduce((sum, r) => {
                  const n = parseInt(r.quantity);
                  return sum + (isNaN(n) ? 0 : n);
                }, 0);
                const vessels = Array.from(new Set(rows.map((r) => r.vessel).filter(Boolean)));
                const statuses = Array.from(new Set(rows.map((r) => r.status)));
                const etaDates = rows.map((r) => r.eta).filter(Boolean).sort();
                const earliestEta = etaDates[0];
                return (
                  <button
                    key={containerKey}
                    onClick={() => onViewContainer(containerKey)}
                    className="group text-left bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {/* Container number */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
                          <Layers className="w-4.5 h-4.5 text-blue-600" style={{ width: 18, height: 18 }} />
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Container</p>
                          <p className="font-mono font-bold text-gray-900 text-sm leading-tight">{containerKey}</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors mt-1 shrink-0" />
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-center">
                        <p className="text-lg font-bold text-gray-900 leading-none">{rows.length}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Shipments</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-center">
                        <p className="text-lg font-bold text-gray-900 leading-none">{totalKg.toLocaleString()}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">kg</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-center">
                        <p className="text-lg font-bold text-gray-900 leading-none">{totalPieces > 0 ? totalPieces.toLocaleString() : '—'}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Pieces</p>
                      </div>
                    </div>

                    {/* Vessel */}
                    {vessels.length > 0 && (
                      <p className="text-xs text-gray-500 truncate mb-2">
                        <span className="font-medium text-gray-700">Vessel:</span> {vessels.join(', ')}
                      </p>
                    )}

                    {/* ETA */}
                    {earliestEta && (
                      <p className="text-xs text-gray-500 mb-3">
                        <span className="font-medium text-gray-700">ETA:</span> {fmtDate(earliestEta)}
                      </p>
                    )}

                    {/* Status chips */}
                    <div className="flex flex-wrap gap-1">
                      {statuses.map((st) => (
                        <StatusBadge key={st} status={st} />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : (
          /* Flat table */
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {[
                      'CW','LLS Reference','Supplier','Invoice','Delivery Note',
                      'PO','Part Number','Quantity','Package','Kilo',
                      'Pick up','Booking','Vessel','Container',
                      'ETS','ETA','ETA Knipping','Status',
                      ...(isAdmin ? [''] : []),
                    ].map((h, i) => (
                      <th key={i} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 tracking-wide border-r border-gray-100 last:border-r-0">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loadingData ? (
                    <tr>
                      <td colSpan={isAdmin ? 19 : 18} className="px-4 py-12 text-center text-gray-400">
                        Loading shipments…
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 19 : 18} className="px-4 py-12 text-center text-gray-400">
                        No shipments match your filters.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((s) => (
                      <tr
                        key={s.id}
                        onClick={() => onView(s.id)}
                        className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                      >
                        <td className="px-3 py-2 border-r border-gray-50">
                          <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-white text-xs font-bold ${cwColors[s.cw] ?? 'bg-gray-500'}`}>
                            {s.cw}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-700 border-r border-gray-50">{s.llsReference}</td>
                        <td className="px-3 py-2 text-gray-700 border-r border-gray-50">{s.supplier}</td>
                        <td className="px-3 py-2 text-gray-600 border-r border-gray-50">{s.invoice}</td>
                        <td className="px-3 py-2 text-gray-600 border-r border-gray-50">{s.deliveryNote}</td>
                        <td className="px-3 py-2 text-gray-600 border-r border-gray-50">{s.po || '—'}</td>
                        <td className="px-3 py-2 text-gray-700 font-medium border-r border-gray-50 max-w-[180px] truncate">{s.partNumber}</td>
                        <td className="px-3 py-2 text-gray-600 border-r border-gray-50">{s.quantity}</td>
                        <td className="px-3 py-2 text-gray-600 border-r border-gray-50">{s.package}</td>
                        <td className="px-3 py-2 text-gray-600 border-r border-gray-50 text-right">{s.kilo}</td>
                        <td className="px-3 py-2 text-gray-600 border-r border-gray-50">{fmtDate(s.pickUp)}</td>
                        <td className="px-3 py-2 text-gray-700 font-medium border-r border-gray-50">{s.booking}</td>
                        <td className="px-3 py-2 text-gray-700 border-r border-gray-50">{s.vessel}</td>
                        <td className="px-3 py-2 text-gray-700 font-medium border-r border-gray-50">{s.container}</td>
                        <td className="px-3 py-2 text-gray-600 border-r border-gray-50">{fmtDate(s.ets)}</td>
                        <td className="px-3 py-2 text-gray-600 border-r border-gray-50">{fmtDate(s.eta)}</td>
                        <td className="px-3 py-2 text-gray-500 border-r border-gray-50">{s.etaKnipping || '—'}</td>
                        <td className="px-3 py-2 border-r border-gray-50">
                          <StatusBadge status={s.status} note={s.statusNote} />
                        </td>
                        {isAdmin && (
                          <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => setEditTarget(s)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(s.id)}
                                disabled={deletingId === s.id}
                                className="p-1.5 text-gray-400 hover:text-rose-600 transition-colors disabled:opacity-40"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/40 text-xs text-gray-400">
              Showing {filtered.length} of {shipments.length} shipment{shipments.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </main>

      {/* Add/Edit modal */}
      {editTarget !== null && (
        <ShipmentModal
          initial={editTarget === 'new' ? undefined : editTarget}
          onSave={handleSave}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}

/* ── mini dropdown ── */
import { forwardRef } from 'react';

const DropdownFilter = forwardRef<HTMLDivElement, {
  open: boolean; onToggle: () => void; label: string;
  icon?: React.ReactNode; children: React.ReactNode;
}>(({ open, onToggle, label, icon, children }, ref) => (
  <div ref={ref} className="relative">
    <button
      onClick={onToggle}
      className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors font-medium text-gray-700"
    >
      {icon}
      {label}
      <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && (
      <div className="absolute left-0 top-full mt-1 min-w-[160px] bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1 max-h-60 overflow-y-auto">
        {children}
      </div>
    )}
  </div>
));

function DropItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 text-sm transition-colors ${active ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
    >
      {children}
    </button>
  );
}
