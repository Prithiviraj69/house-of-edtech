'use client';

import { useState, useEffect, FormEvent } from 'react';
import { Share2, UserPlus, Shield, AlertCircle, X, CheckCircle2 } from 'lucide-react';

interface Collaborator {
  id: string;
  role: 'owner' | 'editor' | 'viewer';
  name: string;
  email: string;
  userId: string;
}

interface ShareManagerProps {
  documentId: string;
  role: 'owner' | 'editor' | 'viewer';
}

export default function ShareManager({ documentId, role }: ShareManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [collabRole, setCollabRole] = useState<'editor' | 'viewer'>('editor');
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchCollaborators();
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, documentId]);

  const fetchCollaborators = async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}/collaborators`);
      if (res.ok) {
        const data = await res.json();
        setCollaborators(data.collaborators || []);
      }
    } catch (e) {
      console.error('Failed to load collaborators');
    }
  };

  const handleAddCollaborator = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/documents/${documentId}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          role: collabRole,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(`Successfully added ${email} as ${collabRole}!`);
        setEmail('');
        await fetchCollaborators();
      } else {
        setError(data.error || 'Failed to add collaborator');
      }
    } catch (err) {
      setError('A connection error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const isOwner = role === 'owner';

  return (
    <div className="relative">
      {/* Share Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
      >
        <Share2 className="w-3.5 h-3.5" />
        <span>Share</span>
      </button>

      {/* Modal Dialog */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl p-6 flex flex-col gap-5 relative animate-in fade-in zoom-in-95 duration-200">
            {/* Close */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-bold tracking-wider text-zinc-100 uppercase flex items-center gap-2">
                <Share2 className="w-4 h-4 text-indigo-400" />
                <span>Share Document</span>
              </h2>
              <p className="text-[10px] text-zinc-400 font-medium">Manage permissions and add collaborators</p>
            </div>

            {/* Error / Success feedback */}
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs px-3 py-2 rounded-lg flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs px-3 py-2 rounded-lg flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            {/* Invite Form (only visible to Owners) */}
            {isOwner ? (
              <form onSubmit={handleAddCollaborator} className="flex flex-col gap-3">
                <label className="text-[10px] font-bold text-zinc-500 uppercase">Invite Collaborator</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter teammate's email..."
                    className="flex-1 bg-zinc-950 text-xs px-3 py-2.5 rounded-xl border border-zinc-800 focus:outline-none focus:border-indigo-500 text-zinc-200"
                  />
                  <select
                    value={collabRole}
                    onChange={(e) => setCollabRole(e.target.value as 'editor' | 'viewer')}
                    className="bg-zinc-950 text-xs px-3 py-2.5 rounded-xl border border-zinc-800 text-zinc-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    type="submit"
                    disabled={isLoading || !email.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-850 text-white rounded-xl px-4 py-2 text-xs font-bold flex items-center gap-1.5 transition"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Invite</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="bg-zinc-850/50 border border-zinc-800 px-3 py-2 rounded-lg text-[10px] text-zinc-500 flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-500/60" />
                <span>Only the document owner can invite new collaborators.</span>
              </div>
            )}

            {/* Directory List */}
            <div className="flex flex-col gap-2 mt-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase">Teammates with Access</label>
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                {collaborators.length === 0 ? (
                  <span className="text-xs text-zinc-600 py-3 text-center font-medium">No other teammates invited yet.</span>
                ) : (
                  collaborators.map((collab) => (
                    <div
                      key={collab.id}
                      className="flex justify-between items-center bg-zinc-950/40 border border-zinc-850 rounded-xl px-3 py-2"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold text-zinc-200">{collab.name}</span>
                        <span className="text-[10px] font-medium text-zinc-500">{collab.email}</span>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                        collab.role === 'owner' 
                          ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/20' 
                          : collab.role === 'editor'
                          ? 'bg-sky-600/20 text-sky-400 border border-sky-500/20'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}>
                        {collab.role}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
