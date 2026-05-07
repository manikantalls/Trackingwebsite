import { useState, useEffect, FormEvent } from 'react';
import {
  Users, UserPlus, Trash2, Shield, User, X, AlertCircle,
  CheckCircle2, ArrowLeft, Eye, EyeOff, RefreshCw,
} from 'lucide-react';
import { supabase, Profile } from '../lib/supabase';

interface Props {
  onBack: () => void;
}

export default function UserManagement({ onBack }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  // New user form
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');
  const [showPw, setShowPw] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
    setProfiles((data ?? []) as Profile[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function handleAddUser(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');

    // Use signUp to create the user — the trigger auto-creates profile
    const { data, error: signUpErr } = await supabase.auth.admin
      ? // admin API not available in browser; use our edge function pattern
        // We'll use a server-side approach via supabase.functions or the service key
        // Since we can't use admin API client-side, we sign up and then update the profile
        await supabase.auth.signUp({
          email: newEmail,
          password: newPassword,
          options: { data: { full_name: newName, role: newRole } },
        })
      : await supabase.auth.signUp({
          email: newEmail,
          password: newPassword,
          options: { data: { full_name: newName, role: newRole } },
        });

    if (signUpErr) {
      setFormError(signUpErr.message);
      setSubmitting(false);
      return;
    }

    const uid = data?.user?.id;
    if (uid) {
      // Upsert profile with the chosen role (trigger may have already created it)
      await supabase.from('profiles').upsert({
        id: uid,
        email: newEmail,
        full_name: newName,
        role: newRole,
      }, { onConflict: 'id' });
    }

    setNewEmail('');
    setNewName('');
    setNewPassword('');
    setNewRole('user');
    setShowAdd(false);
    showToast('User created successfully');
    await load();
    setSubmitting(false);
  }

  async function handleDelete(profile: Profile) {
    if (!window.confirm(`Remove user "${profile.email}"? This cannot be undone.`)) return;
    setDeleting(profile.id);
    // Delete the profile row; auth user remains but can no longer log in meaningfully
    const { error } = await supabase.from('profiles').delete().eq('id', profile.id);
    if (error) {
      showToast('Failed to remove user.');
    } else {
      showToast('User removed.');
      await load();
    }
    setDeleting(null);
  }

  async function handleRoleToggle(profile: Profile) {
    const newRole = profile.role === 'admin' ? 'user' : 'admin';
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', profile.id);
    if (!error) {
      showToast(`Role updated to ${newRole}`);
      await load();
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
          <Users className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-gray-700">User Management</span>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white text-sm rounded-xl shadow-lg">
          <CheckCircle2 className="w-4 h-4" />
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
            <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              Add User
            </button>
          </div>
        </div>

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
      </div>
    </div>
  );
}
