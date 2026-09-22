import { create } from 'zustand';
import { api } from '../api/bridge';
import type {
  Device, IncomingOffer, Settings, StatsSnapshot, StatsTick, TransferSnapshot, CoreStatus,
} from '../../shared/types';

interface AppState {
  devices: Device[];
  transfers: TransferSnapshot[];
  offers: IncomingOffer[];
  settings: Settings | null;
  statsTick: StatsTick | null;
  coreStatus: CoreStatus;
  selectedDeviceId: string | null;
  rightPanelMode: 'network' | 'device';
  /** Last send failure, shown to the user; sends used to fail silently. */
  sendError: string | null;

  selectDevice: (id: string | null) => void;
  setRightPanelMode: (mode: 'network' | 'device') => void;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  sendFiles: (deviceId: string, paths: string[]) => Promise<void>;
  clearSendError: () => void;
  respondToOffer: (offerId: string, accept: boolean, trust: boolean) => Promise<void>;
  fetchStats: (range: '15m' | '1h' | '24h') => Promise<StatsSnapshot>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  devices: [],
  transfers: [],
  offers: [],
  settings: null,
  statsTick: null,
  coreStatus: { connected: false, reconnecting: false },
  selectedDeviceId: null,
  rightPanelMode: 'network',
  sendError: null,

  selectDevice: (id) => set({ selectedDeviceId: id, rightPanelMode: id ? 'device' : 'network' }),
  setRightPanelMode: (mode) => set({ rightPanelMode: mode }),
  clearSendError: () => set({ sendError: null }),

  async refresh() {
    const snapshot = await api.core.getSnapshot();
    set({
      devices: snapshot.devices,
      transfers: snapshot.transfers,
      offers: snapshot.offers,
      settings: snapshot.settings,
      coreStatus: { connected: true, reconnecting: false },
    });
  },

  async init() {
    // The core lives in a separate process that may still be starting, or may
    // be mid-restart. Retry rather than leaving the window permanently empty;
    // the core:status listener below takes over once it is up.
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        await get().refresh();
        break;
      } catch {
        set({ coreStatus: { connected: false, reconnecting: true } });
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    api.onEvent('devices:changed', (devices) => set({ devices }));
    api.onEvent('transfer:updated', (t) =>
      set((s) => {
        const idx = s.transfers.findIndex((x) => x.id === t.id);
        const transfers = [...s.transfers];
        const previous = idx >= 0 ? transfers[idx] : undefined;
        // Progress events for a large transfer leave the per-file array out to
        // keep the payload small; hold on to the last one we were given.
        const next =
          t.filesOmitted && previous ? { ...t, files: previous.files, filesOmitted: false } : t;
        if (idx >= 0) transfers[idx] = next;
        else transfers.unshift(next);
        return { transfers };
      }),
    );
    api.onEvent('transfer:removed', ({ id }) =>
      set((s) => ({ transfers: s.transfers.filter((t) => t.id !== id) })),
    );
    api.onEvent('offer:incoming', (offer) => set((s) => ({ offers: [...s.offers, offer] })));
    api.onEvent('offer:closed', ({ offerId }) =>
      set((s) => ({ offers: s.offers.filter((o) => o.offerId !== offerId) })),
    );
    api.onEvent('stats:tick', (tick) => set({ statsTick: tick }));
    api.onEvent('core:status', (status) => {
      const wasConnected = get().coreStatus.connected;
      set({ coreStatus: status });
      // The core runs in its own process and can be restarted under us. The
      // devices and transfers we are showing belong to the old one, so pull a
      // fresh snapshot rather than leaving stale rows on screen forever.
      if (status.connected && !wasConnected) {
        void get().refresh().catch(() => undefined);
      }
      if (!status.connected) set({ devices: [], statsTick: null });
    });
  },

  async sendFiles(deviceId, paths) {
    // Callers include a drag-drop handler that cannot await, so a rejection
    // here used to vanish entirely - the user saw nothing happen at all.
    set({ sendError: null });
    try {
      await api.core.sendFiles(deviceId, paths);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ sendError: message.replace(/^Error:\s*/, '') });
    }
  },

  async respondToOffer(offerId, accept, trust) {
    await api.core.respondToOffer(offerId, accept, trust);
    set((s) => ({ offers: s.offers.filter((o) => o.offerId !== offerId) }));
  },

  async fetchStats(range) {
    return api.core.getStats(range);
  },

  async updateSettings(patch) {
    const settings = await api.core.updateSettings(patch);
    set({ settings });
  },
}));

export function selectDeviceById(id: string | null) {
  if (!id) return undefined;
  return useStore.getState().devices.find((d) => d.id === id);
}
