import React, { useEffect, useState } from 'react';
import { useStore } from './store';
import { HomeScreen } from './features/home/HomeScreen';
import { TransfersScreen } from './features/transfers/TransfersScreen';
import { DashboardScreen } from './features/dashboard/DashboardScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { OfferPrompt } from './features/offers/OfferPrompt';
import { useApplyTheme } from './useApplyTheme';
import { CountBadge, DashboardIcon, HomeIcon, InfoBar, SettingsIcon, TransfersIcon } from './components/ui';

export type Screen = 'home' | 'transfers' | 'dashboard' | 'settings';

const TOP_NAV: { id: Screen; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <HomeIcon size={18} /> },
  { id: 'transfers', label: 'Transfers', icon: <TransfersIcon size={18} /> },
  { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon size={18} /> },
];

/**
 * One NavigationView item. The label hides below the lg breakpoint, where the
 * pane collapses to icons the way WinUI's does, so the button carries its name
 * in aria-label rather than relying on the visible text.
 */
function NavItem({ label, icon, selected, badge, onClick }: {
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={badge ? `${label}, ${badge} in progress` : label}
      aria-current={selected ? 'page' : undefined}
      title={label}
      className={`relative flex items-center gap-3.5 h-9 rounded-control px-3 text-[14px] text-left transition-colors ${
        selected ? 'bg-subtle-hover' : 'hover:bg-subtle-hover'
      }`}
    >
      {selected && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-accent" />}
      <span className="text-fg">{icon}</span>
      <span className="hidden lg:inline flex-1 text-fg">{label}</span>
      {badge ? (
        <span className="absolute lg:static top-0.5 right-0.5">
          <CountBadge count={badge} />
        </span>
      ) : null}
    </button>
  );
}

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
    <div className="h-screen w-screen flex bg-shell text-fg overflow-hidden">
      <nav aria-label="Main" className="w-14 lg:w-[248px] shrink-0 flex flex-col gap-0.5 px-1.5 pt-3 pb-3">
        <div className="flex items-center gap-2.5 h-9 px-3 mb-2" aria-hidden="true">
          <span className="w-[18px] h-[18px] rounded-[4px] bg-accent flex items-center justify-center shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h5l2.5-6 3 12 2.5-6h5" />
            </svg>
          </span>
          <span className="hidden lg:inline text-[12px] text-fg-2">EtherTransfer</span>
        </div>
        {TOP_NAV.map((n) => (
          <NavItem
            key={n.id}
            label={n.label}
            icon={n.icon}
            selected={screen === n.id}
            badge={n.id === 'transfers' && activeCount > 0 ? activeCount : undefined}
            onClick={() => setScreen(n.id)}
          />
        ))}
        <div className="flex-1" />
        <NavItem
          label="Settings"
          icon={<SettingsIcon size={18} />}
          selected={screen === 'settings'}
          onClick={() => setScreen('settings')}
        />
      </nav>

      <main className="flex-1 min-w-0 flex flex-col bg-layer border-t border-l border-stroke rounded-tl-card">
        {!coreStatus.connected && (
          <div className="px-8 pt-4">
            <InfoBar severity="warning" title={coreStatus.reconnecting ? 'Reconnecting' : 'Transfer service stopped'}>
              {coreStatus.reconnecting
                ? 'The transfer service is restarting. Devices will reappear in a moment.'
                : 'Restart EtherTransfer to continue sending and receiving.'}
            </InfoBar>
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
