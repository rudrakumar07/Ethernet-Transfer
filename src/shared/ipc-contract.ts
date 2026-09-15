import type {
  Device,
  DeviceId,
  IncomingOffer,
  Settings,
  StatsRange,
  StatsSnapshot,
  StatsTick,
  TransferId,
  TransferSnapshot,
  CoreStatus,
} from './types';

/** Commands sent renderer -> core (via main relay). */
export interface CoreCommands {
  getSnapshot(): Promise<{ devices: Device[]; transfers: TransferSnapshot[]; offers: IncomingOffer[]; settings: Settings }>;
  sendFiles(deviceId: DeviceId, paths: string[]): Promise<TransferId>;
  connectByAddress(address: string, port?: number): Promise<void>;
  respondToOffer(offerId: string, accept: boolean, trustDevice: boolean): Promise<void>;
  pauseTransfer(id: TransferId): Promise<void>;
  resumeTransfer(id: TransferId): Promise<void>;
  cancelTransfer(id: TransferId): Promise<void>;
  retryTransfer(id: TransferId): Promise<void>;
  discardTransfer(id: TransferId): Promise<void>;
  setTrusted(deviceId: DeviceId, trusted: boolean): Promise<void>;
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  getStats(range: StatsRange): Promise<StatsSnapshot>;
  getDiagnostics(): Promise<string>;
}

/** Commands sent renderer -> main (OS-only concerns). */
export interface MainCommands {
  pickFiles(): Promise<string[]>;
  pickFolder(): Promise<string | null>;
  showInFolder(path: string): Promise<void>;
  setStartOnLogin(enabled: boolean): Promise<void>;
}

/** Events core -> renderer. */
export interface CoreEvents {
  'devices:changed': Device[];
  'transfer:updated': TransferSnapshot;
  'offer:incoming': IncomingOffer;
  'offer:closed': { offerId: string };
  'stats:tick': StatsTick;
  'core:status': CoreStatus;
}

export type CoreEventName = keyof CoreEvents;
