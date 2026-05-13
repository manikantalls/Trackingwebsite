import { useState, useEffect, useRef, FormEvent } from 'react';
import {
  Users, UserPlus, Trash2, Shield, User, X, AlertCircle,
  CheckCircle2, ArrowLeft, Eye, EyeOff, RefreshCw, Upload, KeyRound,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase, Profile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  onBack: () => void;
}

interface ImportedUser {
  email: string;
  password: string;
  full_name: string;
  role: 'user' | 'admin';
}

export default function UserManagement({ onBack }: Props) {
  const { session } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [toastError, setToastError] = useState(false);

  // New user form
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');
  const [showPw, setShowPw] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset password
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);

  // Import
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportedUser[] | null>(null);
  const [importError, setImportError] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
    setProfiles((data ?? []) as Profile[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function showToast(msg: string, isError = false) {
    setToast(msg);
    setToastError(isError);
    setTimeout(() => setToast(''), 4000);
  }

  async function callCreateUser(payload: { email: string; password: string; full_name: string; role: 'user' | 'admin' }) {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'Apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(payload),
      }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Failed to create user');
    return json;
  }

  async function handleAddUser(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await callCreateUser({ email: newEmail, password: newPassword, full_name: newName, role: newRole });
      setNewEmail('');
      setNewName('');
      setNewPassword('');
      setNewRole('user');
      setShowAdd(false);
      showToast('User created successfully');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(profile: Profile) {
    if (!window.confirm(`Remove user "${profile.email}"? This cannot be undone.`)) return;
    setDeleting(profile.id);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'Apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ userId: profile.id }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to delete user');
      showToast('User removed.');
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to remove user.', true);
    }
    setDeleting(null);
  }

  async function handleRoleToggle(profile: Profile) {
    const nextRole = profile.role === 'admin' ? 'user' : 'admin';
    const { error } = await supabase.from('profiles').update({ role: nextRole }).eq('id', profile.id);
    if (!error) {
      showToast(`Role updated to ${nextRole}`);
      await load();
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    if (resetPw.length < 6) { setResetError('Password must be at least 6 characters.'); return; }
    setResetting(true);
    setResetError('');
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'Apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ userId: resetTarget.id, password: resetPw }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to reset password');
      setResetTarget(null);
      setResetPw('');
      showToast(`Password reset for ${resetTarget.email}`);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  }

  // ── Excel import ──────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

        const users: ImportedUser[] = rows.map((row) => {
          const role = String(row['Role'] ?? row['role'] ?? 'user').toLowerCase();
          return {
            email: String(row['Email'] ?? row['email'] ?? '').trim(),
            password: String(row['Password'] ?? row['password'] ?? '').trim(),
            full_name: String(row['Full Name'] ?? row['full_name'] ?? row['Name'] ?? '').trim(),
            role: (role === 'admin' ? 'admin' : 'user') as 'user' | 'admin',
          };
        }).filter((u) => u.email && u.password);

        if (users.length === 0) {
          setImportError('No valid rows found. Expected columns: Email, Password, Full Name, Role');
          setImportPreview(null);
        } else {
          setImportPreview(users);
        }
      } catch {
        setImportError('Failed to parse file. Check format and try again.');
        setImportPreview(null);
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleImportConfirm() {
    if (!importPreview) return;
    setImporting(true);
    let successCount = 0;
    const errors: string[] = [];
    for (const u of importPreview) {
      try {
        await callCreateUser(u);
        successCount++;
      } catch (err) {
        errors.push(`${u.email}: ${err instanceof Error ? err.message : 'error'}`);
      }
    }
    setImporting(false);
    setImportPreview(null);
    await load();
    if (errors.length === 0) {
      showToast(`${successCount} user${successCount !== 1 ? 's' : ''} imported successfully`);
    } else {
      showToast(`${successCount} imported, ${errors.length} failed: ${errors[0]}`, true);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <img src="/logo.png" alt="Knipping Logo" className="h-28 w-auto object-contain" />
        <span className="text-sm font-semibold text-gray-700">User Management</span>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 text-white text-sm rounded-xl shadow-lg transition-all ${toastError ? 'bg-rose-600' : 'bg-emerald-600'}`}>
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {toast}
        </div>
      )}

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600 transition-colors" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
            >
              <Upload className="w-4 h-4" />
              Import Excel
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
            <button
              onClick={() => { setShowAdd(true); setFormError(''); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              Add User
            </button>
          </div>
        </div>

        {/* Import preview */}
        {importPreview && (
          <div className="bg-white border border-blue-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Import Preview</h3>
                <p className="text-xs text-gray-500 mt-0.5">{importPreview.length} user{importPreview.length !== 1 ? 's' : ''} ready to import</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setImportPreview(null)}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportConfirm}
                  disabled={importing}
                  className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                  {importing ? 'Importing…' : 'Confirm Import'}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-56 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    {['Email', 'Full Name', 'Role', 'Password'].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 border-b border-gray-100">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {importPreview.map((u, i) => (
                    <tr key={i} className="hover:bg-gray-50/60">
                      <td className="px-4 py-2 text-gray-700">{u.email}</td>
                      <td className="px-4 py-2 text-gray-600">{u.full_name || '—'}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${u.role === 'admin' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          {u.role === 'admin' ? <Shield className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-400 font-mono">{'•'.repeat(Math.min(u.password.length, 10))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {importError && (
          <div className="flex items-start gap-2.5 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {importError}
          </div>
        )}

        {/* Add User modal */}
        {showAdd && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-800">Add New User</h3>
                <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAddUser} className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Full Name</label>
                  <input
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="John Smith"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="user@company.com"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min. 6 characters"
                      className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Role</label>
                  <div className="flex gap-3">
                    {(['user', 'admin'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setNewRole(r)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 border rounded-lg text-sm font-medium transition-all ${
                          newRole === r
                            ? r === 'admin' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-400 bg-gray-50 text-gray-700'
                            : 'border-gray-200 text-gray-400 hover:border-gray-300'
                        }`}
                      >
                        {r === 'admin' ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                {formError && (
                  <div className="flex items-start gap-2 px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    {formError}
                  </div>
                )}
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60">
                    {submitting ? 'Creating…' : 'Create User'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Reset Password modal */}
        {resetTarget && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <h3 className="text-base font-semibold text-gray-800">Reset Password</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{resetTarget.email}</p>
                </div>
                <button onClick={() => { setResetTarget(null); setResetPw(''); setResetError(''); }} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleResetPassword} className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">New Password</label>
                  <div className="relative">
                    <input
                      type={showResetPw ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={resetPw}
                      onChange={(e) => setResetPw(e.target.value)}
                      placeholder="Min. 6 characters"
                      className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button type="button" onClick={() => setShowResetPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showResetPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">The user will be prompted to set their own password on next login.</p>
                </div>
                {resetError && (
                  <div className="flex items-start gap-2 px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    {resetError}
                  </div>
                )}
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => { setResetTarget(null); setResetPw(''); setResetError(''); }} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={resetting} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60">
                    {resetting ? 'Resetting…' : 'Reset Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Users Table */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">All Users</h3>
            <span className="text-xs text-gray-400">{profiles.length} user{profiles.length !== 1 ? 's' : ''}</span>
          </div>
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
          ) : profiles.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">No users found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Name</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Email</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Role</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Joined</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {profiles.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${p.role === 'admin' ? 'bg-blue-600' : 'bg-gray-400'}`}>
                          {(p.full_name || p.email).charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-800">{p.full_name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-gray-600">{p.email}</td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        p.role === 'admin'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-gray-100 text-gray-600 border-gray-200'
                      }`}>
                        {p.role === 'admin' ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                        {p.role}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-gray-500 text-xs">
                      {new Date(p.created_at).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleRoleToggle(p)}
                          title={`Switch to ${p.role === 'admin' ? 'user' : 'admin'}`}
                          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          Make {p.role === 'admin' ? 'User' : 'Admin'}
                        </button>
                        <button
                          onClick={() => { setResetTarget(p); setResetPw(''); setResetError(''); setShowResetPw(false); }}
                          title="Reset password"
                          className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          disabled={deleting === p.id}
                          className="p-1.5 text-gray-400 hover:text-rose-600 transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Import format hint */}
        <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500">
          <span className="font-semibold text-gray-600">Excel import format:</span> Columns — <span className="font-mono">Email</span>, <span className="font-mono">Password</span>, <span className="font-mono">Full Name</span>, <span className="font-mono">Role</span> (user/admin)
        </div>
      </div>
    </div>
  );
}
