'use client';

import { useEffect, useState } from 'react';
import { syncEngine, SyncStatus } from '@/lib/syncEngine';
import { Wifi, WifiOff, CloudLightning, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function ConnectionStatus() {
  const [status, setStatus] = useState<SyncStatus>('online');
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(false);

  useEffect(() => {
    // Subscribe to syncEngine connection state
    const unsubscribe = syncEngine.subscribeStatus((newStatus) => {
      setStatus(newStatus);
    });

    // Load initial simulated offline status
    import('@/lib/localDb').then(({ localDB }) => {
      localDB.getMeta<boolean>('simulated_offline').then((val) => {
        setIsSimulatedOffline(!!val);
      });
    });

    return () => unsubscribe();
  }, []);

  const handleToggleOffline = async () => {
    const nextVal = !isSimulatedOffline;
    setIsSimulatedOffline(nextVal);
    await syncEngine.toggleSimulatedOffline(nextVal);
  };

  const getStatusConfig = () => {
    switch (status) {
      case 'online':
        return {
          icon: <Wifi className="w-4 h-4 text-emerald-400" />,
          text: 'Connected',
          className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        };
      case 'syncing':
        return {
          icon: <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />,
          text: 'Syncing changes...',
          className: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        };
      case 'saved':
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
          text: 'All changes saved',
          className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        };
      case 'offline':
        return {
          icon: <WifiOff className="w-4 h-4 text-rose-400" />,
          text: isSimulatedOffline ? 'Simulated Offline' : 'Offline Mode',
          className: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        };
      case 'error':
      default:
        return {
          icon: <CloudLightning className="w-4 h-4 text-rose-400" />,
          text: 'Sync Error',
          className: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="flex items-center gap-4">
      {/* Status Badge */}
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-300 ${config.className}`}
      >
        {config.icon}
        <span>{config.text}</span>
      </div>

      {/* Manual Toggle Switch */}
      <button
        onClick={handleToggleOffline}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
          isSimulatedOffline
            ? 'bg-rose-600/20 border-rose-500/40 text-rose-400 hover:bg-rose-600/30'
            : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-300 hover:bg-zinc-800'
        }`}
      >
        {isSimulatedOffline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
        <span>{isSimulatedOffline ? 'Go Online' : 'Simulate Offline'}</span>
      </button>
    </div>
  );
}
