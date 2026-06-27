'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { syncEngine, SyncStatus } from '@/lib/syncEngine';
import { localDB, LocalBlock } from '@/lib/localDb';
import EditorCanvas from '@/components/EditorCanvas';
import SnapshotManager from '@/components/SnapshotManager';
import SidebarAi from '@/components/SidebarAi';
import ConnectionStatus from '@/components/ConnectionStatus';
import CollaboratorsList from '@/components/CollaboratorsList';
import ShareManager from '@/components/ShareManager';
import { ArrowLeft, Clock, Sparkles, RefreshCw, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface DocumentMeta {
  title: string;
  role: 'owner' | 'editor' | 'viewer';
}

export default function DocumentWorkspacePage() {
  const router = useRouter();
  const params = useParams();
  const documentId = params.id as string;

  const [userId, setUserId] = useState<string | null>(null);
  const [docMeta, setDocMeta] = useState<DocumentMeta | null>(null);
  const [blocks, setBlocks] = useState<LocalBlock[]>([]);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [showAi, setShowAi] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // Editable document title
  const [tempTitle, setTempTitle] = useState('');

  useEffect(() => {
    if (!documentId) return;

    let unsubscribeBlocks: (() => void) | null = null;
    let unsubscribeTitle: (() => void) | null = null;

    const setupSessionAndSync = async () => {
      try {
        // 1. Fetch user session
        const sessionRes = await fetch('/api/auth/session');
        const sessionData = await sessionRes.json();
        
        if (!sessionData.user) {
          router.push('/login');
          return;
        }
        setUserId(sessionData.user.id);

        // 2. Fetch document metadata and sync initial blocks from server database
        const syncRes = await fetch(`/api/documents/${documentId}/sync`);
        if (!syncRes.ok) {
          router.push('/dashboard');
          return;
        }
        const syncData = await syncRes.json();
        setDocMeta({
          title: syncData.title || 'Untitled Document',
          role: syncData.role || 'viewer',
        });
        setTempTitle(syncData.title || 'Untitled Document');

        // 3. Initialize background sync engine and load current state from IndexedDB
        syncEngine.init(documentId);
        
        // Force complete reconciliation from server to fetch latest edits
        await syncEngine.forceReconcileFromServer();

        // 4. Subscribe to blocks updates to supply live content to the AI sidebar
        unsubscribeBlocks = syncEngine.subscribeBlocks((loadedBlocks) => {
          setBlocks(loadedBlocks);
        });

        // 5. Subscribe to title updates
        unsubscribeTitle = syncEngine.subscribeTitle((newTitle) => {
          setDocMeta((prev) => prev ? { ...prev, title: newTitle } : null);
          setTempTitle(newTitle);
        });

        setIsLoading(false);
      } catch (err) {
        console.error('Error initializing document workspace:', err);
        router.push('/dashboard');
      }
    };

    setupSessionAndSync();

    return () => {
      if (unsubscribeBlocks) unsubscribeBlocks();
      if (unsubscribeTitle) unsubscribeTitle();
      syncEngine.cleanup();
    };
  }, [documentId]);

  // Rename document title trigger (owner & editors only)
  const handleRenameTitle = async () => {
    if (!docMeta || docMeta.role === 'viewer' || tempTitle.trim() === docMeta.title) {
      setTempTitle(docMeta?.title || '');
      return;
    }

    const titleToSave = tempTitle.trim() || 'Untitled Document';
    try {
      const res = await fetch(`/api/documents/${documentId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: (syncEngine as any).clientId || 'title-update',
          operations: [], // Empty ops array tells the server to check metadata updates if needed
          title: titleToSave,
        }),
      });

      // Update local docMeta state
      setDocMeta((prev) => prev ? { ...prev, title: titleToSave } : null);
    } catch (e) {
      console.warn('Failed to rename document title on server');
    }
  };

  if (isLoading || !docMeta || !userId) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-zinc-500 font-medium">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
          <span className="text-xs">Loading collaborative workspace...</span>
        </div>
      </div>
    );
  }

  const isReadOnly = docMeta.role === 'viewer';

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans overflow-hidden selection:bg-indigo-600/30 selection:text-indigo-200">
      
      {/* Workspace Main Header */}
      <header className="h-16 bg-zinc-900 border-b border-zinc-800 px-6 flex justify-between items-center shadow-md shrink-0">
        {/* Left Side: Back & Title */}
        <div className="flex items-center gap-4 flex-1">
          <Link
            href="/dashboard"
            onClick={() => syncEngine.cleanup()}
            title="Back to Dashboard"
            className="flex items-center justify-center p-2 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/50 text-zinc-400 hover:text-zinc-200 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          {/* Editable Document Title */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              onBlur={handleRenameTitle}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              disabled={isReadOnly}
              className="bg-transparent border-none text-zinc-200 hover:text-zinc-100 focus:text-white font-bold text-sm outline-none focus:ring-0 px-1 py-0.5 rounded focus:bg-zinc-950 transition max-w-xs md:max-w-md"
            />
            {isReadOnly && (
              <span className="text-[10px] uppercase font-bold text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                View Only
              </span>
            )}
          </div>
        </div>

        {/* Center Side: Active Collaborator Indicators */}
        <div className="hidden lg:flex items-center justify-center px-4">
          <CollaboratorsList />
        </div>

        {/* Right Side: Connections & Sidebars Toggle buttons */}
        <div className="flex items-center gap-3 justify-end flex-1">
          <ShareManager documentId={documentId} role={docMeta.role} />
          <ConnectionStatus />

          <div className="w-px h-6 bg-zinc-800 mx-1 hidden sm:block" />

          {/* Version Snapshots toggle */}
          <button
            onClick={() => setShowSnapshots(!showSnapshots)}
            title="Toggle Version History"
            className={`flex items-center justify-center p-2 rounded-xl border transition ${
              showSnapshots
                ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-400'
                : 'bg-zinc-800/60 border-zinc-700/50 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Clock className="w-4 h-4" />
          </button>

          {/* AI Sidebar toggle */}
          <button
            onClick={() => setShowAi(!showAi)}
            title="Toggle AI Assistant"
            className={`flex items-center justify-center p-2 rounded-xl border transition ${
              showAi
                ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-400'
                : 'bg-zinc-800/60 border-zinc-700/50 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Sparkles className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Editor Body Area */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Left Side: Version History Sidebar */}
        {showSnapshots && (
          <div className="relative z-10 shrink-0 h-full flex">
            <SnapshotManager documentId={documentId} role={docMeta.role} />
            {/* Collapse toggle helper */}
            <button
              onClick={() => setShowSnapshots(false)}
              className="absolute top-1/2 -translate-y-1/2 -right-3 w-6 h-10 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-200 shadow-md hover:bg-zinc-800 transition z-20"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Center: Main Editor Canvas */}
        <EditorCanvas documentId={documentId} userId={userId} role={docMeta.role} />

        {/* Right Side: AI Assistant Sidebar */}
        {showAi && (
          <div className="relative z-10 shrink-0 h-full flex">
            {/* Collapse toggle helper */}
            <button
              onClick={() => setShowAi(false)}
              className="absolute top-1/2 -translate-y-1/2 -left-3 w-6 h-10 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-200 shadow-md hover:bg-zinc-800 transition z-20"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <SidebarAi blocks={blocks} />
          </div>
        )}
      </div>

      {/* Footer Presence Meta Info */}
      <footer className="h-8 border-t border-zinc-900 bg-zinc-950 flex items-center justify-between px-6 text-[10px] text-zinc-600 font-semibold shrink-0 select-none">
        <span>House of Edtech &bull; {docMeta.title}</span>
        <div className="flex items-center gap-2">
          <span>Role: <strong className="text-zinc-500 uppercase">{docMeta.role}</strong></span>
          <span>&bull;</span>
          <span>IndexedDB V1</span>
        </div>
      </footer>
    </div>
  );
}
