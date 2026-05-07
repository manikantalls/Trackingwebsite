import { useState, useEffect, useRef } from 'react';
import { FileText, Upload, Trash2, Download, Eye, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Document {
  id: string;
  filename: string;
  storage_path: string;
  size_bytes: number;
  created_at: string;
}

interface Props {
  container?: string;
  shipmentId?: string;
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function DocumentsSection({ container, shipmentId }: Props) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadDocs() {
    setLoading(true);
    let query = supabase.from('documents').select('*').order('created_at', { ascending: false });
    if (shipmentId) {
      query = query.eq('shipment_id', shipmentId);
    } else if (container) {
      query = query.eq('container', container).is('shipment_id', null);
    }
    const { data, error } = await query;
    if (!error && data) setDocs(data as Document[]);
    setLoading(false);
  }

  useEffect(() => { loadDocs(); }, [container, shipmentId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are allowed.');
      return;
    }
    setError('');
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('documents').upload(path, file);
      if (uploadErr) throw uploadErr;

      const { error: dbErr } = await supabase.from('documents').insert({
        container: container ?? null,
        shipment_id: shipmentId ?? null,
        filename: file.name,
        storage_path: path,
        size_bytes: file.size,
        uploaded_by: profile?.id,
      });
      if (dbErr) {
        await supabase.storage.from('documents').remove([path]);
        throw dbErr;
      }
      await loadDocs();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleOpen(doc: Document) {
    setOpeningId(doc.id);
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.storage_path, 300);
    setOpeningId(null);
    if (error || !data?.signedUrl) { setError('Could not open file.'); return; }
    window.open(data.signedUrl, '_blank');
  }

  async function handleDelete(doc: Document) {
    if (!window.confirm(`Delete "${doc.filename}"? This cannot be undone.`)) return;
    setDeletingId(doc.id);
    await supabase.storage.from('documents').remove([doc.storage_path]);
    await supabase.from('documents').delete().eq('id', doc.id);
    setDeletingId(null);
    await loadDocs();
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-800">Documents</h2>
          {!loading && (
            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{docs.length}</span>
          )}
        </div>
        {isAdmin && (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? 'Uploading…' : 'Upload PDF'}
            </button>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={handleUpload} />
          </>
        )}
      </div>

      {error && (
        <div className="mx-5 mt-3 px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-gray-400 text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading documents…
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
          <FileText className="w-8 h-8 text-gray-200" />
          <p className="text-sm">No documents uploaded yet</p>
          {isAdmin && <p className="text-xs">Click "Upload PDF" to add documents</p>}
        </div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors group">
              <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-rose-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{doc.filename}</p>
                <p className="text-xs text-gray-400">{fmtSize(doc.size_bytes)} · {fmtDate(doc.created_at)}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleOpen(doc)}
                  disabled={openingId === doc.id}
                  className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-40"
                  title="View PDF"
                >
                  {openingId === doc.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Eye className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => handleOpen(doc)}
                  disabled={openingId === doc.id}
                  className="p-1.5 text-gray-400 hover:text-teal-600 transition-colors disabled:opacity-40"
                  title="Download PDF"
                >
                  <Download className="w-4 h-4" />
                </button>
                {isAdmin && (
                  <button
                    onClick={() => handleDelete(doc)}
                    disabled={deletingId === doc.id}
                    className="p-1.5 text-gray-400 hover:text-rose-600 transition-colors disabled:opacity-40"
                    title="Delete"
                  >
                    {deletingId === doc.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
