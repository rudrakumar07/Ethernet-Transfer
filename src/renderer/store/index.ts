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

  selectDevice: (id: string | null) => void;
  setRightPanelMode: (mode: 'network' | 'device') => void;
  init: () => Promise<void>;
  sendFiles: (deviceId: string, paths: string[]) => Promise<void>;
  respondToOffer: (offerId: string, accept: boolean, trust: boolean) => Promise<void>;
  fetchStats: (range: '15m' | '1h' | '24h') => Promise<StatsSnapshot>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
}

export const useStore = create<AppState>((set) => ({
  devices: [],
  transfers: [],
  offers: [],
  settings: null,
  statsTick: null,
  coreStatus: { connected: false, reconnecting: false },
  selectedDeviceId: null,
  rightPanelMode: 'network',

  selectDevice: (id) => set({ selectedDeviceId: id, rightPanelMode: id ? 'device' : 'network' }),
  setRightPanelMode: (mode) => set({ rightPanelMode: mode }),

  async init() {
    const snapshot = await api.core.getSnapshot();
    set({ devices: snapshot.devices, transfers: snapshot.transfers, settings: snapshot.settings });

    api.onEvent('devices:changed', (devices) => set({ devices }));
    api.onEvent('transfer:updated', (t) =>
      set((s) => {
        const idx = s.transfers.findIndex((x) => x.id === t.id);
        const transfers = [...s.transfers];
        if (idx >= 0) transfers[idx] = t;
        else transfers.unshift(t);
        return { transfers };
      }),
    );
    api.onEvent('offer:incoming', (offer) => set((s) => ({ offers: [...s.offers, offer] })));
    api.onEvent('offer:closed', ({ offerId }) =>
      set((s) => ({ offers: s.offers.filter((o) => o.offerId !== offerId) })),
    );
    api.onEvent('stats:tick', (tick) => set({ statsTick: tick }));
    api.onEvent('core:status', (status) => set({ coreStatus: status }));
  },

  async sendFiles(deviceId, paths) {
    await api.core.sendFiles(deviceId, paths);
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
