import path from 'node:path';
import {
  createNodeClock,
  createNodeLogger,
  createNodePlatform,
  createNodeFileSystem,
  createNodeCertificateFactory,
  createNodeInterfaceProvider,
  createNodeUdpTransport,
  createNodeTlsTransport,
  createNodeMdnsProvider,
} from './adapters/node';
import { createSettingsService } from './settings';
import { createIdentityService } from './identity';
import { createTrustService } from './trust';
import { createDiscoveryService } from './discovery';
import { createStatsService } from './stats';
import { createTransferService, buildFileList } from './transfer';
import { createCoreApi } from './api';
import type { CoreCommands } from '../shared/ipc-contract';
import type { CoreEvents } from '../shared/ipc-contract';

export interface CoreHandle {
  api: CoreCommands;
  onEvent<K extends keyof CoreEvents>(name: K, listener: (payload: CoreEvents[K]) => void): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** Composition root: builds adapters, wires modules, exposes the typed API. */
export async function createCore(dataDir: string, appVersion: string): Promise<CoreHandle> {
  const clock = createNodeClock();
  const platform = createNodePlatform(dataDir, appVersion);
  const logger = createNodeLogger(path.join(dataDir, 'logs', 'core.log'));
  const fs = createNodeFileSystem();
  const certificates = createNodeCertificateFactory();
  const interfaces = createNodeInterfaceProvider();
  const udp = createNodeUdpTransport();
  const tls = createNodeTlsTransport();
  const mdns = createNodeMdnsProvider();

  const settings = await createSettingsService({ fs, platform });
  const identityService = await createIdentityService({ fs, platform, certificates, settings });
  const identity = identityService.get();
  const trust = await createTrustService({ fs, platform });
  const stats = createStatsService({ fs, platform, clock });

  let transferPort = 47800;
  const discovery = createDiscoveryService({
    udp,
    mdns,
    interfaces,
    clock,
    logger,
    identity,
    trust,
    settings,
    transferPort: () => transferPort,
  });

  const transfer = createTransferService({
    fs,
    platform,
    tls,
    identity,
    trust,
    discovery,
    settings,
    stats,
    logger,
    buildFileList,
  });

  const listeners = new Map<keyof CoreEvents, Set<(payload: unknown) => void>>();
  function emit<K extends keyof CoreEvents>(name: K, payload: CoreEvents[K]) {
    const set = listeners.get(name);
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  discovery.events.on('deviceUp', () => emit('devices:changed', discovery.listDevices()));
  discovery.events.on('deviceUpdated', () => emit('devices:changed', discovery.listDevices()));
  discovery.events.on('deviceDown', () => emit('devices:changed', discovery.listDevices()));
  transfer.events.on('updated', (t) => emit('transfer:updated', t));
  transfer.events.on('removed', (r) => emit('transfer:removed', r));
  transfer.events.on('offerIncoming', (o) => emit('offer:incoming', o));
  transfer.events.on('offerClosed', (o) => emit('offer:closed', o));

  clock.setInterval(() => {
    stats.recordDeviceCount(discovery.listDevices().length);
    const { sentBps, receivedBps } = transfer.throughput();
    stats.recordThroughput(sentBps, receivedBps);
    emit('stats:tick', stats.tick());
  }, 500);

  const api = createCoreApi({ discovery, transfer, settings, stats, trust });

  return {
    api,
    onEvent(name, listener) {
      let set = listeners.get(name);
      if (!set) {
        set = new Set();
        listeners.set(name, set);
      }
      set.add(listener as (payload: unknown) => void);
    },
    async start() {
      // The transfer server binds first: discovery advertises transferPort(),
      // and starting it the other way round meant the first beacons announced
      // the preferred port even when the server had landed on a different one.
      await transfer.start();
      transferPort = transfer.port();
      await discovery.start();
      stats.start();
      logger.info('core started', { deviceId: identity.deviceId, port: transferPort });
    },
    async stop() {
      stats.stop();
      await transfer.stop();
      await discovery.stop();
    },
  };
}
