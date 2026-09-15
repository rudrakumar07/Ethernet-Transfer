import path from 'node:path';
import type { Clock, FileSystem, Platform } from '../ports';
import type { LinkType, StatsRange, StatsSnapshot, StatsTick } from '../../shared/types';
import { RingBuffer } from './logic/ring-buffer';

export interface StatsService {
  recordDeviceCount(count: number): void;
  recordThroughput(sentBps: number, receivedBps: number): void;
  recordDeviceBytes(deviceId: string, deviceName: string, linkType: LinkType, bytes: number): void;
  snapshot(range: StatsRange): StatsSnapshot;
  tick(): StatsTick;
  start(): void;
  stop(): void;
}

export interface StatsDeps {
  fs: FileSystem;
  platform: Platform;
  clock: Clock;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SAMPLE_MS = 10_000;
const PERSIST_MS = 60_000;

const RANGE_MS: Record<StatsRange, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': DAY_MS,
};

export function createStatsService(deps: StatsDeps): StatsService {
  const { fs, platform, clock } = deps;
  const filePath = path.join(platform.dataDir(), 'stats', 'device-count.json');

  const devicesOnline = new RingBuffer(DAY_MS);
  const throughputSent = new RingBuffer(RANGE_MS['15m']);
  const throughputReceived = new RingBuffer(RANGE_MS['15m']);
  const perDeviceBytes = new Map<string, { deviceName: string; linkType: LinkType; bytes: number }>();

  let lastDeviceCount = 0;
  let lastSentBps = 0;
  let lastReceivedBps = 0;
  let sampleTimer: unknown;
  let persistTimer: unknown;

  return {
    recordDeviceCount(count) {
      lastDeviceCount = count;
    },

    recordThroughput(sentBps, receivedBps) {
      lastSentBps = sentBps;
      lastReceivedBps = receivedBps;
      const now = clock.now();
      throughputSent.push(now, sentBps);
      throughputReceived.push(now, receivedBps);
    },

    recordDeviceBytes(deviceId, deviceName, linkType, bytes) {
      const existing = perDeviceBytes.get(deviceId);
      perDeviceBytes.set(deviceId, {
        deviceName,
        linkType,
        bytes: (existing?.bytes ?? 0) + bytes,
      });
    },

    snapshot(range) {
      const now = clock.now();
      const ms = RANGE_MS[range];
      return {
        devicesOnline: devicesOnline.range(ms, now),
        throughputSent: throughputSent.range(Math.min(ms, RANGE_MS['15m']), now),
        throughputReceived: throughputReceived.range(Math.min(ms, RANGE_MS['15m']), now),
        perDeviceBytes: Array.from(perDeviceBytes.entries()).map(([deviceId, v]) => ({
          deviceId,
          deviceName: v.deviceName,
          linkType: v.linkType,
          bytes: v.bytes,
        })),
      };
    },

    tick() {
      return {
        devicesOnline: lastDeviceCount,
        speedSentBps: lastSentBps,
        speedReceivedBps: lastReceivedBps,
      };
    },

    start() {
      void fs.readJson<{ points: { t: number; value: number }[] }>(filePath).then((loaded) => {
        if (loaded?.points) devicesOnline.loadAll(loaded.points);
      });

      sampleTimer = clock.setInterval(() => {
        devicesOnline.push(clock.now(), lastDeviceCount);
      }, SAMPLE_MS);

      persistTimer = clock.setInterval(() => {
        void fs.writeJsonAtomic(filePath, { points: devicesOnline.all() });
      }, PERSIST_MS);
    },

    stop() {
      if (sampleTimer) clock.clearInterval(sampleTimer);
      if (persistTimer) clock.clearInterval(persistTimer);
    },
  };
}
