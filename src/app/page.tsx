import Link from 'next/link';
import { BookOpen, ArrowRight, Sparkles, Shield, Zap, RefreshCw } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-between p-6 font-sans selection:bg-indigo-600/30 selection:text-indigo-200">
      {/* Header */}
      <header className="w-full max-w-5xl flex justify-between items-center py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/5">
            <BookOpen className="w-5 h-5" />
          </div>
          <span className="font-bold tracking-tight text-zinc-100 text-lg">House of Edtech</span>
        </div>
        <Link
          href="/login"
          className="text-xs font-bold text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 rounded-xl px-4 py-2.5 transition"
        >
          Sign In
        </Link>
      </header>

      {/* Main Hero */}
      <main className="flex-1 max-w-4xl w-full flex flex-col justify-center items-center text-center gap-8 py-20">
        <div className="flex flex-col gap-4 items-center">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-600/5 text-indigo-400 text-xs font-semibold tracking-wide animate-pulse">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Introducing Local-First Collaboration</span>
          </div>
          
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-zinc-100 font-sans max-w-3xl leading-tight">
            Collaborative documents that work <span className="text-indigo-400">offline</span> first.
          </h1>
          
          <p className="text-sm sm:text-base text-zinc-400 max-w-xl leading-relaxed mt-2 font-medium">
            Edit with zero latency. Automatically synchronize your work when the connection resolves, featuring robust 3-way conflict resolution, version control, and Google Gemini AI integration.
          </p>
        </div>

        <div className="flex gap-4">
          <Link
            href="/dashboard"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-6 py-3 rounded-xl shadow-xl shadow-indigo-600/10 transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>Open Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-12 text-left">
          {/* Card 1 */}
          <div className="bg-zinc-900/40 border border-zinc-800 p-5 rounded-2xl flex flex-col gap-3">
            <Zap className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-zinc-200 text-sm">Local-First Speed</h3>
            <p className="text-xs text-zinc-500 leading-relaxed font-medium">
              Read and write instantly using client-side IndexedDB. Zero network requests blocking your edits.
            </p>
          </div>
          {/* Card 2 */}
          <div className="bg-zinc-900/40 border border-zinc-800 p-5 rounded-2xl flex flex-col gap-3">
            <RefreshCw className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-zinc-200 text-sm">Background Sync</h3>
            <p className="text-xs text-zinc-500 leading-relaxed font-medium">
              Changes queue offline and auto-sync when online. Merged deterministically with line-by-line conflict resolution.
            </p>
          </div>
          {/* Card 3 */}
          <div className="bg-zinc-900/40 border border-zinc-800 p-5 rounded-2xl flex flex-col gap-3">
            <Shield className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-zinc-200 text-sm">Snapshots & AI</h3>
            <p className="text-xs text-zinc-500 leading-relaxed font-medium">
              Save timeline checkpoints, restore states safely, and write with built-in Google Gemini co-author autocomplete.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full text-center text-xs text-zinc-600 py-4 font-medium border-t border-zinc-900">
        House of Edtech Fullstack Assignment 2 &bull; Developed by{' '}
        <a href="https://github.com/Prithiviraj69" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 underline">Prithiviraj Elumalai</a> &bull;{' '}
        <a href="https://www.linkedin.com/in/prithiviraj-elumalai/" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 underline">LinkedIn Profile</a>
      </footer>
    </div>
  );
}
