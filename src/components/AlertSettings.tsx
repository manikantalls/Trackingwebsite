import { useState, useEffect, useCallback, FormEvent } from 'react';
import {
  ArrowLeft, RefreshCw, Mail, Send, AlertTriangle, Plus, X,
  CheckCircle2, Settings, Clock, FileText, Users, History, Zap, RotateCcw, Trash2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Shipment, transitTimeDays } from '../types';
import { fetchShipments } from '../data/store';

interface Props {
  onBack: () => void;
}

interface AlertConfig {
  id: string;
  from_address: string;
  to_recipients: string[];
  cc_recipients: string[];
  subject_template: string;
  body_template: string;
  transit_threshold: number;
}

interface AlertLogEntry {
  id: string;
  shipment_id: string | null;
  recipient: string;
  subject: string;
  status: string;
  error: string | null;
  sent_at: string;
  auto_sent: boolean;
}

type Tab = 'delayed' | 'settings' | 'history';

export default function AlertSettings({ onBack }: Props) {
  const { session, profile } = useAuth();
  const [tab, setTab] = useState<Tab>('delayed');

  // Config state
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  // Form state
  const [fromAddress, setFromAddress] = useState('');
  const [toRecipients, setToRecipients] = useState<string[]>([]);
  const [ccRecipients, setCcRecipients] = useState<string[]>([]);
  const [subjectTemplate, setSubjectTemplate] = useState('');
  const [bodyTemplate, setBodyTemplate] = useState('');
  const [threshold, setThreshold] = useState(42);
  const [newTo, setNewTo] = useState('');
  const [newCc, setNewCc] = useState('');

  // Delayed shipments
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [shipmentsLoading, setShipmentsLoading] = useState(true);

  // Sending
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; total: number; results: { shipment_id: string; booking: string; status: string; error?: string }[] } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');

  // History
  const [logs, setLogs] = useState<AlertLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState('');
  const [toastError, setToastError] = useState(false);

  function showToast(msg: string, isError = false) {
    setToast(msg);
    setToastError(isError);
    setTimeout(() => setToast(''), 4000);
  }

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    const { data, error } = await supabase
      .from('alert_config')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (error) {
      showToast('Failed to load alert config', true);
      setConfigLoading(false);
      return;
    }
    if (data) {
      const cfg = data as AlertConfig;
      setConfig(cfg);
      setFromAddress(cfg.from_address || '');
      setToRecipients(cfg.to_recipients || []);
      setCcRecipients(cfg.cc_recipients || []);
      setSubjectTemplate(cfg.subject_template || '');
      setBodyTemplate(cfg.body_template || '');
      setThreshold(cfg.transit_threshold || 42);
    }
    setConfigLoading(false);
  }, []);

  const loadShipments = useCallback(async () => {
    setShipmentsLoading(true);
    try {
      const data = await fetchShipments();
      setShipments(data);
    } catch {
      showToast('Failed to load shipments', true);
    } finally {
      setShipmentsLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    const { data, error } = await supabase
      .from('alert_log')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(100);
    if (error) {
      showToast('Failed to load history', true);
      setLogsLoading(false);
      return;
    }
    setLogs((data ?? []) as AlertLogEntry[]);
    setLogsLoading(false);
  }, []);

  async function handleDeleteLog(logId: string) {
    const log = logs.find((l) => l.id === logId);
    const { error } = await supabase.from('alert_log').delete().eq('id', logId);
    if (error) {
      showToast('Failed to delete log entry', true);
    } else {
      if (log?.shipment_id) {
        await supabase.from('shipments').update({ alert_sent_at: null }).eq('id', log.shipment_id);
      }
      setLogs((prev) => prev.filter((l) => l.id !== logId));
      showToast('Log entry deleted — alert status reset');
      await loadShipments();
    }
  }

  async function handleClearAllLogs() {
    if (logs.length === 0) return;
    if (!window.confirm(`Delete all ${logs.length} log entries? This also resets alert status on all shipments so auto-alerts can trigger again.`)) return;
    const { error: logErr } = await supabase.from('alert_log').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (logErr) {
      showToast('Failed to clear history', true);
      return;
    }
    const { error: shipErr } = await supabase.from('shipments').update({ alert_sent_at: null }).not('alert_sent_at', 'is', null);
    if (shipErr) {
      showToast('History cleared, but failed to reset shipment alert status', true);
    } else {
      showToast('History cleared and shipment alert status reset');
    }
    setLogs([]);
    await loadShipments();
  }

  useEffect(() => {
    loadConfig();
    loadShipments();
  }, [loadConfig, loadShipments]);

  useEffect(() => {
    if (tab === 'history') loadLogs();
  }, [tab, loadLogs]);

  const delayedShipments = shipments.filter((s) => {
    const td = transitTimeDays(s.pickUp, s.eta);
    return td !== null && td > threshold;
  });

  const pendingAutoShipments = delayedShipments.filter((s) => !s.alert_sent_at);
  const alreadyAlertedShipments = delayedShipments.filter((s) => s.alert_sent_at);

  async function handleResetAlert(shipmentId: string) {
    const { error } = await supabase
      .from('shipments')
      .update({ alert_sent_at: null })
      .eq('id', shipmentId);
    if (error) {
      showToast('Failed to reset alert status', true);
    } else {
      showToast('Alert status reset — will be auto-sent next cycle');
      await loadShipments();
    }
  }

  function fmtDate(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  }

  function fmtDateTime(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  async function handleSaveConfig(e: FormEvent) {
    e.preventDefault();
    setConfigSaving(true);
    setConfigSaved(false);
    try {
      const payload = {
        from_address: fromAddress,
        to_recipients: toRecipients,
        cc_recipients: ccRecipients,
        subject_template: subjectTemplate,
        body_template: bodyTemplate,
        transit_threshold: threshold,
        updated_at: new Date().toISOString(),
      };
      if (config) {
        const { error } = await supabase.from('alert_config').update(payload).eq('id', config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('alert_config').insert(payload);
        if (error) throw error;
      }
      setConfigSaved(true);
      showToast('Alert settings saved');
      await loadConfig();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', true);
    } finally {
      setConfigSaving(false);
    }
  }

  async function callAlertApi(mode: 'all' | 'test' | 'single', extra?: Record<string, unknown>) {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-delay-alert`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'Apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ mode, ...extra }),
      },
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Request failed');
    return json;
  }

  async function persistConfig(): Promise<boolean> {
    const payload = {
      from_address: fromAddress,
      to_recipients: toRecipients,
      cc_recipients: ccRecipients,
      subject_template: subjectTemplate,
      body_template: bodyTemplate,
      transit_threshold: threshold,
      updated_at: new Date().toISOString(),
    };
    try {
      if (config) {
        const { error } = await supabase.from('alert_config').update(payload).eq('id', config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('alert_config').insert(payload);
        if (error) throw error;
      }
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save settings', true);
      return false;
    }
  }

  async function handleSendAll() {
    if (delayedShipments.length === 0) {
      showToast('No delayed shipments to alert about');
      return;
    }
    if (toRecipients.length === 0) {
      showToast('Add at least one To recipient in Email Settings first', true);
      return;
    }
    if (!window.confirm(`Send delay alert emails for ${delayedShipments.length} delayed shipment(s)?`)) return;
    setSending(true);
    setSendResult(null);
    try {
      if (!(await persistConfig())) { setSending(false); return; }
      const result = await callAlertApi('all');
      setSendResult(result);
      if (result.sent > 0) {
        showToast(`${result.sent} of ${result.total} alert email(s) sent`);
      } else {
        showToast('No emails sent — check Outlook credentials', true);
      }
      await loadShipments();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to send alerts', true);
    } finally {
      setSending(false);
    }
  }

  async function handleSendSingle(shipmentId: string) {
    if (toRecipients.length === 0) {
      showToast('Add at least one To recipient in Email Settings first', true);
      return;
    }
    setSending(true);
    try {
      if (!(await persistConfig())) return;
      const result = await callAlertApi('single', { shipment_id: shipmentId });
      showToast(`Alert sent for shipment ${result.results?.[0]?.booking ?? ''}`);
      await loadShipments();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to send alert', true);
    } finally {
      setSending(false);
    }
  }

  async function handleTestEmail() {
    if (!testEmail) {
      showToast('Enter a test email address first', true);
      return;
    }
    setTesting(true);
    try {
      const result = await callAlertApi('test', { test_email: testEmail });
      showToast(result.message ?? 'Test email sent');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Test email failed', true);
    } finally {
      setTesting(false);
    }
  }

  function addToRecipient() {
    const email = newTo.trim();
    if (!email) return;
    if (toRecipients.includes(email)) { setNewTo(''); return; }
    setToRecipients([...toRecipients, email]);
    setNewTo('');
  }

  function addCcRecipient() {
    const email = newCc.trim();
    if (!email) return;
    if (ccRecipients.includes(email)) { setNewCc(''); return; }
    setCcRecipients([...ccRecipients, email]);
    setNewCc('');
  }

  const PLACEHOLDERS = [
    '{remarks}', '{booking}', '{vessel}', '{cw}', '{ets}', '{eta}', '{transit_days}',
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Knipping Logo" className="h-28 w-auto object-contain" />
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-tight">Delay Alert Management</h1>
            <p className="text-xs text-gray-400">Configure and send shipment delay notifications</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { loadConfig(); loadShipments(); }} className="p-2 text-gray-400 hover:text-gray-600 transition-colors" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${configLoading || shipmentsLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
        </div>
      </header>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 text-white text-sm rounded-xl shadow-lg transition-all ${toastError ? 'bg-rose-600' : 'bg-emerald-600'}`}>
          {toastError ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          {toast}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white px-6">
        <nav className="flex gap-1">
          {[
            { key: 'delayed' as Tab, label: 'Delayed Shipments', icon: AlertTriangle },
            { key: 'settings' as Tab, label: 'Email Settings', icon: Settings },
            { key: 'history' as Tab, label: 'Send History', icon: History },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {key === 'delayed' && delayedShipments.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 text-rose-700">
                  {delayedShipments.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* ── Delayed Shipments Tab ─────────────────────────────── */}
        {tab === 'delayed' && (
          <div className="space-y-4">
            {/* Auto-send status banner */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg shrink-0">
                <Zap className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-900">Automatic delay alerts are active</h3>
                <p className="text-xs text-gray-600 mt-0.5">
                  A scheduled job checks every 30 minutes for shipments with transit time &gt; {threshold} days and sends delay emails automatically using the Remarks field as the reason. Each shipment is emailed only once unless you reset its alert status.
                </p>
                <div className="flex items-center gap-4 mt-2 text-xs">
                  <span className="flex items-center gap-1 text-rose-600 font-medium">
                    <AlertTriangle className="w-3 h-3" />
                    {pendingAutoShipments.length} pending auto-send
                  </span>
                  <span className="flex items-center gap-1 text-emerald-600 font-medium">
                    <CheckCircle2 className="w-3 h-3" />
                    {alreadyAlertedShipments.length} already alerted
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                    Delayed Shipments (Transit Time &gt; {threshold} days)
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Shipments where ETA − Pick up exceeds {threshold} days. The Remarks field is used as the delay reason in the email.
                  </p>
                </div>
                <button
                  onClick={handleSendAll}
                  disabled={sending || delayedShipments.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sending ? 'Sending…' : `Send All Alerts (${delayedShipments.length})`}
                </button>
              </div>

              {sendResult && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                  Sent {sendResult.sent} of {sendResult.total} emails.
                  {sendResult.results?.some((r) => r.status === 'failed') && (
                    <span className="text-rose-600"> Some emails failed — check Send History for details.</span>
                  )}
                </div>
              )}

              {shipmentsLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-400 text-sm">Loading shipments…</div>
              ) : delayedShipments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm">
                  <CheckCircle2 className="w-8 h-8 mb-2 text-emerald-400" />
                  No delayed shipments. All shipments are within the {threshold}-day transit threshold.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs text-gray-400 uppercase tracking-wider">
                        <th className="py-2 px-3 font-semibold">CW</th>
                        <th className="py-2 px-3 font-semibold">Booking</th>
                        <th className="py-2 px-3 font-semibold">Vessel</th>
                        <th className="py-2 px-3 font-semibold">ETS</th>
                        <th className="py-2 px-3 font-semibold">ETA</th>
                        <th className="py-2 px-3 font-semibold">Transit</th>
                        <th className="py-2 px-3 font-semibold">Remarks (Reason)</th>
                        <th className="py-2 px-3 font-semibold">Auto-Sent</th>
                        <th className="py-2 px-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {delayedShipments.map((s) => {
                        const td = transitTimeDays(s.pickUp, s.eta);
                        return (
                          <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                            <td className="py-2.5 px-3 font-mono text-gray-700">{s.cw}</td>
                            <td className="py-2.5 px-3 text-gray-700">{s.booking || '—'}</td>
                            <td className="py-2.5 px-3 text-gray-700">{s.vessel || '—'}</td>
                            <td className="py-2.5 px-3 text-gray-500">{fmtDate(s.ets)}</td>
                            <td className="py-2.5 px-3 text-gray-500">{fmtDate(s.eta)}</td>
                            <td className="py-2.5 px-3">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-700">
                                <Clock className="w-3 h-3" />
                                {td}d
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-gray-600 max-w-xs truncate" title={s.remarks}>
                              {s.remarks || <span className="text-gray-300 italic">No remarks</span>}
                            </td>
                            <td className="py-2.5 px-3">
                              {s.alert_sent_at ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-700 w-fit">
                                    <CheckCircle2 className="w-3 h-3" /> Sent
                                  </span>
                                  <span className="text-[10px] text-gray-400">{fmtDateTime(s.alert_sent_at)}</span>
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700">
                                  <Clock className="w-3 h-3" /> Pending
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleSendSingle(s.id)}
                                  disabled={sending}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
                                  title="Send alert now"
                                >
                                  <Send className="w-3 h-3" />
                                  Send
                                </button>
                                {s.alert_sent_at && (
                                  <button
                                    onClick={() => handleResetAlert(s.id)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                                    title="Reset alert status so it auto-sends again"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    Reset
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Settings Tab ───────────────────────────────────────── */}
        {tab === 'settings' && (
          <form onSubmit={handleSaveConfig} className="space-y-4">
            {/* From + Threshold */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4">
                <Mail className="w-4 h-4 text-blue-500" />
                Sender &amp; Threshold
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">From Email Address (Outlook mailbox)</label>
                  <input
                    type="email"
                    value={fromAddress}
                    onChange={(e) => setFromAddress(e.target.value)}
                    placeholder="alerts@yourcompany.com"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 mt-1">The Outlook mailbox that sends the emails. Must match an account your Azure app has permission to send from.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Transit Time Threshold (days)</label>
                  <input
                    type="number"
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    min={1}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 mt-1">Shipments with transit time (ETA − Pick up) above this are considered delayed. Default: 42 days.</p>
                </div>
              </div>
            </div>

            {/* Recipients */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-blue-500" />
                Recipients
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* To */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">To</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="email"
                      value={newTo}
                      onChange={(e) => setNewTo(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addToRecipient(); } }}
                      placeholder="recipient@example.com"
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button type="button" onClick={addToRecipient} className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {toRecipients.length === 0 && <span className="text-xs text-gray-400 italic">No recipients yet</span>}
                    {toRecipients.map((email) => (
                      <span key={email} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg border border-blue-200">
                        {email}
                        <button type="button" onClick={() => setToRecipients(toRecipients.filter((r) => r !== email))} className="text-blue-400 hover:text-blue-600">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
                {/* CC */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">CC</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="email"
                      value={newCc}
                      onChange={(e) => setNewCc(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCcRecipient(); } }}
                      placeholder="cc@example.com"
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button type="button" onClick={addCcRecipient} className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ccRecipients.length === 0 && <span className="text-xs text-gray-400 italic">No CC recipients</span>}
                    {ccRecipients.map((email) => (
                      <span key={email} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-50 text-gray-600 text-xs font-medium rounded-lg border border-gray-200">
                        {email}
                        <button type="button" onClick={() => setCcRecipients(ccRecipients.filter((r) => r !== email))} className="text-gray-400 hover:text-gray-600">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Templates */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-blue-500" />
                Email Templates
              </h2>
              <div className="mb-4">
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className="text-xs text-gray-400 font-medium mr-1">Available placeholders:</span>
                  {PLACEHOLDERS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => { setBodyTemplate(bodyTemplate + ' ' + p); }}
                      className="px-2 py-0.5 text-xs font-mono bg-gray-100 text-gray-600 rounded border border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Subject Template</label>
                  <input
                    type="text"
                    value={subjectTemplate}
                    onChange={(e) => setSubjectTemplate(e.target.value)}
                    placeholder="Shipment Delay Alert - {booking} - {vessel}"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Body Template</label>
                  <textarea
                    value={bodyTemplate}
                    onChange={(e) => setBodyTemplate(e.target.value)}
                    rows={10}
                    placeholder={'Dear Team,\n\nThe shipment for CW{cw} is delayed.\nReason: {remarks}\nTransit time: {transit_days} days\n\nRegards,\nLLS Mexico Team'}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono resize-y"
                  />
                  <p className="text-xs text-gray-400 mt-1">Use \n for line breaks. Placeholders are replaced per shipment.</p>
                </div>
              </div>
            </div>

            {/* Test email */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4">
                <Send className="w-4 h-4 text-blue-500" />
                Test Email
              </h2>
              <p className="text-xs text-gray-500 mb-3">Send a test email to verify your Outlook credentials are working. This does not require recipients to be configured.</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder={profile?.email ?? 'your@email.com'}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={handleTestEmail}
                  disabled={testing}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
                >
                  {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {testing ? 'Sending…' : 'Send Test'}
                </button>
              </div>
            </div>

            {/* Save */}
            <div className="flex items-center justify-end gap-3">
              {configSaved && <span className="text-sm text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Saved</span>}
              <button
                type="submit"
                disabled={configSaving}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
              >
                {configSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {configSaving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </form>
        )}

        {/* ── History Tab ──────────────────────────────────────── */}
        {tab === 'history' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <History className="w-4 h-4 text-blue-500" />
                Send History (Last 100)
              </h2>
              <div className="flex items-center gap-2">
                {logs.length > 0 && (
                  <button
                    onClick={handleClearAllLogs}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors"
                    title="Delete all log entries and reset shipment alert status"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear All
                  </button>
                )}
                <button onClick={loadLogs} className="p-2 text-gray-400 hover:text-gray-600 transition-colors" title="Refresh">
                  <RefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {logsLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-400 text-sm">Loading history…</div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm">
                <History className="w-8 h-8 mb-2 text-gray-300" />
                No emails sent yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs text-gray-400 uppercase tracking-wider">
                      <th className="py-2 px-3 font-semibold">Sent At</th>
                      <th className="py-2 px-3 font-semibold">Recipient</th>
                      <th className="py-2 px-3 font-semibold">Subject</th>
                      <th className="py-2 px-3 font-semibold">Type</th>
                      <th className="py-2 px-3 font-semibold">Status</th>
                      <th className="py-2 px-3 font-semibold">Error</th>
                      <th className="py-2 px-3 font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">{fmtDateTime(log.sent_at)}</td>
                        <td className="py-2.5 px-3 text-gray-700 max-w-xs truncate" title={log.recipient}>{log.recipient}</td>
                        <td className="py-2.5 px-3 text-gray-700 max-w-xs truncate" title={log.subject}>{log.subject}</td>
                        <td className="py-2.5 px-3">
                          {log.auto_sent ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700">
                              <Zap className="w-3 h-3" /> Auto
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600">
                              Manual
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {log.status === 'sent' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-700">
                              <CheckCircle2 className="w-3 h-3" /> Sent
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-700">
                              <AlertTriangle className="w-3 h-3" /> Failed
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-rose-500 text-xs max-w-xs truncate" title={log.error ?? ''}>
                          {log.error || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleDeleteLog(log.id)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
