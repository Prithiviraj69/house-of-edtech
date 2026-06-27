'use client';

import { useEffect, useState } from 'react';
import { syncEngine } from '@/lib/syncEngine';

export default function CollaboratorsList() {
  const [collaborators, setCollaborators] = useState<Array<{ userId: string; name: string }>>([]);

  useEffect(() => {
    // Listen to active presence list maintained by the syncEngine
    const unsubscribe = syncEngine.subscribeCollaborators((list) => {
      setCollaborators(list);
    });
    return () => unsubscribe();
  }, []);

  if (collaborators.length === 0) return null;

  return (
    <div className="flex items-center gap-2 bg-zinc-900/40 px-3 py-1.5 rounded-full border border-zinc-800/40">
      <div className="flex -space-x-2 overflow-hidden">
        {collaborators.map((user, i) => {
          const initials = user.name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();
            
          // Curated aesthetic background colors
          const colors = [
            'bg-purple-600 border-purple-800 text-purple-100',
            'bg-sky-600 border-sky-800 text-sky-100',
            'bg-teal-600 border-teal-800 text-teal-100',
            'bg-orange-600 border-orange-800 text-orange-100',
            'bg-rose-600 border-rose-800 text-rose-100',
          ];
          const color = colors[i % colors.length];

          return (
            <div
              key={user.userId}
              title={`${user.name} is editing`}
              className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold border transition-all hover:z-10 hover:scale-110 cursor-pointer ${color}`}
            >
              {initials}
            </div>
          );
        })}
      </div>
      <span className="text-zinc-400 text-xs font-medium pl-1">
        {collaborators.length} active {collaborators.length === 1 ? 'collaborator' : 'collaborators'}
      </span>
    </div>
  );
}
