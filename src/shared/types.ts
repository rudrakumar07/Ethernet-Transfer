export type DeviceId = string;
export type TransferId = string;

export type LinkType = 'direct' | 'wired' | 'wireless';

export interface DeviceAddress {
  address: string;
  family: 'IPv4' | 'IPv6';
  iface: string;
  linkType: LinkType;
}

export interface Device {
  id: DeviceId;
  name: string;
  os: 'windows' | 'macos' | 'linux' | 'unknown';
  fingerprint: string;
  shortId: string;
  addresses: DeviceAddress[];
  linkType: LinkType;
  trusted: boolean;
  latencyMs?: number;
  lastSeen: number;
  port: number;
}

export type TransferDirection = 'send' | 'receive';

export type TransferStatus =
  /** Walking the selected folders to build the item list, before anything is offered. */
  | 'scanning'
  | 'queued'
  | 'awaiting-accept'
  | 'active'
  | 'paused'
  | 'interrupted'
  | 'completed'
  | 'completed-with-errors'
  | 'declined'
  | 'failed'
  | 'cancelled';

export type FileItemKind = 'file' | 'dir';

export interface TransferItem {
  index: number;
  relPath: string;
  kind: FileItemKind;
  size: number;
  mtimeMs: number;
}

export type FileStatus =
  | 'queued'
  | 'sending'
  | 'verifying'
  | 'verified'
  | 'failed';

export interface TransferFileState {
  item: TransferItem;
  status: FileStatus;
  bytesDone: number;
  reason?: string;
}

export interface TransferSnapshot {
  id: TransferId;
  direction: TransferDirection;
  deviceId: DeviceId;
  deviceName: string;
  status: TransferStatus;
  totalBytes: number;
  bytesDone: number;
  fileCount: number;
  speedBps: number;
  etaSeconds?: number;
  files: TransferFileState[];
  /**
   * True when `files` was left out of this update to keep the payload small.
   * Frequent progress events for a large transfer carry aggregates only; the
   * per-file array arrives on status changes. Consumers keep what they had.
   */
  filesOmitted?: boolean;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

export interface IncomingOffer {
  offerId: string;
  transferId: TransferId;
  deviceId: DeviceId;
  deviceName: string;
  deviceOs: Device['os'];
  linkType: LinkType;
  shortId: string;
  items: TransferItem[];
  totalBytes: number;
  fileCount: number;
  destinationDir: string;
  expiresAt: number;
}

export type StatsRange = '15m' | '1h' | '24h';

export interface StatsPoint {
  t: number;
  value: number;
}

export interface StatsSnapshot {
  devicesOnline: StatsPoint[];
  throughputSent: StatsPoint[];
  throughputReceived: StatsPoint[];
  perDeviceBytes: { deviceId: string; deviceName: string; linkType: LinkType; bytes: number }[];
}

export interface StatsTick {
  devicesOnline: number;
  speedSentBps: number;
  speedReceivedBps: number;
}

export interface Settings {
  deviceName: string;
  downloadDir: string;
  autoAcceptTrusted: boolean;
  theme: 'system' | 'light' | 'dark';
  startOnLogin: boolean;
  minimizeToTray: boolean;
  ignoredInterfaces: string[];
}

export interface TrustedDeviceRecord {
  fingerprint: string;
  deviceId: DeviceId;
  name: string;
  trustedAt: number;
}

export interface CoreStatus {
  connected: boolean;
  reconnecting: boolean;
}
