import React, { useEffect, useState } from 'react';
import { useStore } from './store';
import { HomeScreen } from './features/home/HomeScreen';
import { TransfersScreen } from './features/transfers/TransfersScreen';
import { DashboardScreen } from './features/dashboard/DashboardScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { OfferPrompt } from './features/offers/OfferPrompt';
import { useApplyTheme } from './useApplyTheme';

type Screen = 'home' | 'transfers' | 'dashboard' | 'settings';

const NAV: { id: Screen; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '◯' },
  { id: 'transfers', label: 'Transfers', icon: '⇅' },
  { id: 'dashboard', label: 'Dashboard', icon: '\u{1F4C8}' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const init = useStore((s) => s.init);
  const transfers = useStore((s) => s.transfers);
  const coreStatus = useStore((s) => s.coreStatus);
  useApplyTheme();
  const activeCount = transfers.filter(
    (t) => t.status === 'active' || t.status === 'paused' || t.status === 'scanning',
  ).length;

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="h-screen w-screen flex bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      <nav className="w-24 bg-neutral-100 dark:bg-neutral-900 p-2 flex flex-col gap-1">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => setScreen(n.id)}
            className={`text-xs rounded-md px-2 py-2 flex flex-col items-center gap-1 relative ${
              screen === n.id ? 'bg-blue-600 text-white' : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800'
            }`}
          >
            <span>{n.icon}</span>
            {n.label}
            {n.id === 'transfers' && activeCount > 0 && (
              <span className="absolute top-1 right-2 bg-red-500 text-white rounded-full text-[9px] w-4 h-4 flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </button>
        ))}
      </nav>
      <main className="flex-1 flex flex-col min-w-0">
        {!coreStatus.connected && (
          <div className="px-3 py-1.5 text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200">
            {coreStatus.reconnecting
              ? 'Reconnecting to the transfer service…'
              : 'The transfer service stopped. Restart EtherTransfer to continue.'}
          </div>
        )}
        {screen === 'home' && <HomeScreen onOpenTransfers={() => setScreen('transfers')} />}
        {screen === 'transfers' && <TransfersScreen />}
        {screen === 'dashboard' && <DashboardScreen />}
        {screen === 'settings' && <SettingsScreen />}
      </main>
      <OfferPrompt />
    </div>
  );
}
