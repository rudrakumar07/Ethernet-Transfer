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
  { id: 'home', label: 'Home', icon: '◎' },
  { id: 'transfers', label: 'Transfers', icon: '⇅' },
  { id: 'dashboard', label: 'Dashboard', icon: '◫' },
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
      <nav className="w-[92px] shrink-0 bg-neutral-100 dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 p-2 flex flex-col gap-1">
        <div className="px-2 pt-2 pb-3 text-[11px] font-semibold tracking-tight text-neutral-500">
          EtherTransfer
        </div>
        {NAV.map((n) => {
          const selected = screen === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setScreen(n.id)}
              aria-current={selected ? 'page' : undefined}
              className={`text-[11px] rounded-lg px-2 py-2.5 flex flex-col items-center gap-1 relative transition-colors ${
                selected
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'
              }`}
            >
              <span className="text-base leading-none" aria-hidden>{n.icon}</span>
              {n.label}
              {n.id === 'transfers' && activeCount > 0 && (
                <span
                  className={`absolute top-1.5 right-2 rounded-full text-[9px] min-w-4 h-4 px-1 flex items-center justify-center ${
                    selected ? 'bg-white text-blue-700' : 'bg-blue-600 text-white'
                  }`}
                >
                  {activeCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <main className="flex-1 flex flex-col min-w-0">
        {!coreStatus.connected && (
          <div className="px-4 py-1.5 text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200">
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
