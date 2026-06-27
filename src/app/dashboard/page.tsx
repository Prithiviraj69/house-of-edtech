'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, LogOut, Plus, RefreshCw, FileText, Calendar, ArrowRight, User } from 'lucide-react';

interface Document {
  id: string;
  title: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

interface UserProfile {
  id: string;
  email: string;
  name: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    fetchSessionAndDocs();
  }, []);

  const fetchSessionAndDocs = async () => {
    try {
      // 1. Fetch current logged-in user profile
      const sessionRes = await fetch('/api/auth/session');
      const sessionData = await sessionRes.json();
      
      if (!sessionData.user) {
        router.push('/login');
        return;
      }
      setUser(sessionData.user);

      // 2. Fetch list of documents
      const docsRes = await fetch('/api/documents');
      const docsData = await docsRes.json();
      setDocuments(docsData.documents || []);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreating) return;

    setIsCreating(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() || undefined }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.document?.id) {
          // Direct redirect into document workspace
          router.push(`/documents/${data.document.id}`);
        }
      }
    } catch (err) {
      console.error('Failed to create document:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'DELETE',
      });
      if (res.ok) {
        router.push('/login');
        router.refresh();
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-indigo-600/30 selection:text-indigo-200">
      {/* Top Header */}
      <header className="sticky top-0 bg-zinc-900 border-b border-zinc-800 z-10 py-4 px-6 md:px-12 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 rounded-lg flex items-center justify-center">
            <BookOpen className="w-5 h-5" />
          </div>
          <span className="font-bold tracking-tight text-zinc-100 text-lg">House of Edtech</span>
        </div>

        <div className="flex items-center gap-4">
          {/* User Profile Welcome */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-800 bg-zinc-900/50">
            <User className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-xs font-semibold text-zinc-300">Welcome, {user.name}</span>
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-rose-400 bg-zinc-800 hover:bg-rose-500/10 border border-zinc-700/60 hover:border-rose-500/20 rounded-xl px-4 py-2 transition disabled:opacity-50"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-12 flex flex-col gap-10">
        
        {/* Create Document Box */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-xl">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-bold text-zinc-100">Create a new document</h2>
            <p className="text-xs text-zinc-400 font-medium">Collaborate, snap snapshots, and write with AI assistance</p>
          </div>
          
          <form onSubmit={handleCreateDocument} className="w-full sm:w-auto flex gap-3">
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Q3 Syllabus Draft, Lab Notes"
              className="bg-zinc-950 text-sm px-4 py-2 rounded-xl border border-zinc-800 focus:outline-none focus:border-indigo-500 text-zinc-200 transition-colors w-full sm:w-64"
            />
            <button
              type="submit"
              disabled={isCreating}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-800 text-white rounded-xl px-4 py-2 text-sm font-semibold transition flex items-center justify-center gap-1.5 shrink-0 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              <span>Create</span>
            </button>
          </form>
        </section>

        {/* Documents Grid List */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-bold text-zinc-400 tracking-wider uppercase">Your Documents</h2>

          {isLoadingDocs ? (
            // Skeleton Loader
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((n) => (
                <div key={n} className="bg-zinc-900 border border-zinc-800 rounded-2xl h-40 animate-pulse" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="bg-zinc-900/40 border border-dashed border-zinc-800 rounded-2xl py-16 flex flex-col items-center justify-center gap-3 text-center">
              <FileText className="w-10 h-10 text-zinc-600 stroke-[1.5]" />
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold text-zinc-300">No documents found</span>
                <span className="text-xs text-zinc-500 max-w-xs font-medium">Create a new document above to begin writing and editing.</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => router.push(`/documents/${doc.id}`)}
                  className="group bg-zinc-900 hover:bg-zinc-880 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col justify-between h-40 hover:-translate-y-1"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-400" />
                      <h3 className="font-bold text-zinc-100 text-sm line-clamp-1 group-hover:text-indigo-300 transition-colors">
                        {doc.title}
                      </h3>
                    </div>
                  </div>

                  <div className="flex justify-between items-center border-t border-zinc-800/60 pt-3 text-[10px] text-zinc-500 font-medium">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{new Date(doc.updatedAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-1 text-indigo-400 group-hover:translate-x-1 transition-transform font-bold">
                      <span>Open Workspace</span>
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-zinc-900 bg-zinc-950 text-center text-xs text-zinc-500 mt-auto font-medium">
        House of Edtech Fullstack Assignment 2 &bull; Developed by{' '}
        <a href="https://github.com/Prithiviraj69" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 underline">Prithiviraj Elumalai</a> &bull;{' '}
        <a href="https://www.linkedin.com/in/prithiviraj-elumalai/" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 underline">LinkedIn Profile</a>
      </footer>
    </div>
  );
}
