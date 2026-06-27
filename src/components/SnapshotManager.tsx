'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Camera, Clock, RotateCcw, AlertTriangle } from 'lucide-react';
import { syncEngine } from '@/lib/syncEngine';

interface Snapshot {
  id: string;
  title: string;
  createdAt: string;
  createdByName: string;
}

interface SnapshotManagerProps {
  documentId: string;
  role: 'owner' | 'editor' | 'viewer';
}

export default function SnapshotManager({ documentId, role }: SnapshotManagerProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);

  useEffect(() => {
    fetchSnapshots();
  }, [documentId]);

  const fetchSnapshots = async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}/snapshots`);
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data.snapshots || []);
      }
    } catch (error) {
      console.error('Failed to load snapshots:', error);
    }
  };

  const handleCapture = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isLoading) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      });

      if (res.ok) {
        setTitle('');
        await fetchSnapshots();
      }
    } catch (error) {
      console.error('Failed to capture snapshot:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (snapshotId: string) => {
    if (isRestoring || role === 'viewer') return;
    
    const confirmRestore = confirm(
      'Are you sure you want to restore the document to this version? This will overwrite the current content for all active editors.'
    );
    if (!confirmRestore) return;

    setIsRestoring(snapshotId);
    try {
      const res = await fetch(`/api/documents/${documentId}/snapshots`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshotId,
          clientId: (syncEngine as any).clientId, // retrieve clientId
        }),
      });

      if (res.ok) {
        // Force client syncEngine to reload head state from server immediately
        await syncEngine.forceReconcileFromServer();
      } else {
        alert('Failed to restore snapshot. Access denied.');
      }
    } catch (error) {
      console.error('Failed to restore snapshot:', error);
    } finally {
      setIsRestoring(null);
    }
  };

  const canEdit = role === 'owner' || role === 'editor';

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-r border-zinc-800 text-zinc-300 w-80 select-none">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
        <Clock className="w-5 h-5 text-indigo-400" />
        <h2 className="text-sm font-bold tracking-wider text-zinc-100 uppercase">Version History</h2>
      </div>

      {/* Capture Form */}
      {canEdit && (
        <form onSubmit={handleCapture} className="p-4 border-b border-zinc-800 bg-zinc-900/30 flex flex-col gap-2">
          <label className="text-xs font-semibold text-zinc-500">Capture Snapshot</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Draft v1, Pre-merge..."
              className="flex-1 bg-zinc-900 text-xs px-3 py-2 rounded border border-zinc-800 focus:outline-none focus:border-indigo-500 transition text-zinc-200"
            />
            <button
              type="submit"
              disabled={isLoading || !title.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded p-2 transition flex items-center justify-center"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* History Timeline list */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {snapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-zinc-600 gap-2">
            <Clock className="w-8 h-8 stroke-[1.5]" />
            <span className="text-xs">No version snapshots captured yet.</span>
          </div>
        ) : (
          snapshots.map((snap) => (
            <div
              key={snap.id}
              className="group relative p-3 rounded-lg border border-zinc-800 bg-zinc-900/20 hover:border-zinc-700 hover:bg-zinc-900/40 transition flex flex-col gap-1.5"
            >
              <div className="flex justify-between items-start gap-2">
                <span className="font-semibold text-zinc-200 text-xs line-clamp-1">{snap.title}</span>
                {canEdit && (
                  <button
                    onClick={() => handleRestore(snap.id)}
                    disabled={isRestoring !== null}
                    title="Restore to this state"
                    className="opacity-0 group-hover:opacity-100 flex items-center justify-center p-1 rounded text-zinc-500 hover:text-indigo-400 hover:bg-zinc-800 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-0.5 text-[10px] text-zinc-500 font-medium">
                <span>By {snap.createdByName}</span>
                <span>{new Date(snap.createdAt).toLocaleString()}</span>
              </div>
              {isRestoring === snap.id && (
                <div className="absolute inset-0 bg-zinc-900/80 rounded-lg flex items-center justify-center gap-1.5 text-xs text-indigo-400 font-medium">
                  <span className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
                  Restoring...
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {role === 'viewer' && (
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/10 flex gap-2 text-zinc-500 items-start">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500/60" />
          <span className="text-[10px]">
            You have View-Only access to this document. Restoring version history is disabled.
          </span>
        </div>
      )}
    </div>
  );
}
