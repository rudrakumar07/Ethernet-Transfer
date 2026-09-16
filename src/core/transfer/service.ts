import { randomUUID } from 'node:crypto';
import type { FileSystem, Logger, Platform, TlsConnection, TlsTransport } from '../ports';
import type { Identity } from '../identity';
import type { TrustService } from '../trust';
import type { DiscoveryService } from '../discovery';
import type { SettingsService } from '../settings';
import type { StatsService } from '../stats';
import { TypedEmitter } from '../../shared/typed-emitter';
import type {
  Device,
  DeviceId,
  IncomingOffer,
  TransferFileState,
  TransferId,
  TransferItem,
  TransferSnapshot,
  TransferStatus,
} from '../../shared/types';
import { startTransferServer } from './server';
import { connectToDevice, sendResumeRequest } from './client';
import { runSenderSession } from './session/sender-session';
import { runReceiverSession } from './session/receiver-session';
import { createSessionControl, type SessionControl } from './session/control';
import { canTransition } from './logic/transitions';
import { isValidRelPath } from './logic/path-validator';

export interface TransferEvents {
  updated: TransferSnapshot;
  offerIncoming: IncomingOffer;
  offerClosed: { offerId: string };
}

export interface TransferService {
  events: TypedEmitter<TransferEvents>;
  port(): number;
  send(deviceId: DeviceId, absolutePaths: string[]): Promise<TransferId>;
  respondToOffer(offerId: string, accept: boolean, trustDevice: boolean): Promise<void>;
  pause(id: TransferId): Promise<void>;
  resume(id: TransferId): Promise<void>;
  cancel(id: TransferId): Promise<void>;
  retry(id: TransferId): Promise<void>;
  discard(id: TransferId): Promise<void>;
  list(): TransferSnapshot[];
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface TransferDeps {
  fs: FileSystem;
  platform: Platform;
  tls: TlsTransport;
  identity: Identity;
  trust: TrustService;
  discovery: DiscoveryService;
  settings: SettingsService;
  stats: StatsService;
  logger: Logger;
  buildFileList: (absolutePaths: string[]) => Promise<TransferItem[] & { sources: Map<number, string> }>;
}

const MAX_CONCURRENT_PER_DIRECTION = 3;
const OFFER_TIMEOUT_MS = 60_000;

const BUSY_RETRY_DELAY_MS = 10_000;
const BUSY_RETRY_MAX_ATTEMPTS = 5;

interface InternalTransfer {
  snapshot: TransferSnapshot;
  items: TransferItem[];
  sources?: Map<number, string>; // sender: index -> absolute path
  destinationRoot?: string;
  /** Set while a connection for this transfer is actually live; lets pause()/cancel() take effect immediately. */
  control?: SessionControl;
  /** How many times a DECLINE busy has already been retried (spec §5.8). */
  busyRetries?: number;
}

export function createTransferService(deps: TransferDeps): TransferService {
  const { fs, platform, tls, identity, trust, discovery, settings, stats, logger } = deps;
  const events = new TypedEmitter<TransferEvents>();
  const transfers = new Map<TransferId, InternalTransfer>();
  const pendingOffers = new Map<string, { offer: IncomingOffer; resolve: (r: { accept: boolean; offsets?: Record<number, number> }) => void; timer: unknown }>();
  let serverPort = 0;

  function emitUpdate(t: InternalTransfer) {
    t.snapshot.updatedAt = Date.now();
    events.emit('updated', t.snapshot);
  }

  function setStatus(t: InternalTransfer, status: TransferStatus) {
    if (!canTransition(t.snapshot.status, status)) {
      logger.warn('invalid transfer transition', { from: t.snapshot.status, to: status });
    }
    t.snapshot.status = status;
    emitUpdate(t);
  }

  function fileState(t: InternalTransfer, index: number): TransferFileState | undefined {
    return t.snapshot.files.find((f) => f.item.index === index);
  }

  function activeCount(direction: 'send' | 'receive'): number {
    let n = 0;
    for (const t of transfers.values()) {
      if (t.snapshot.direction === direction && t.snapshot.status === 'active') n++;
    }
    return n;
  }

  /** Starts as many queued outbound transfers as there is room for (spec §5.8). */
  function processSendQueue() {
    if (activeCount('send') >= MAX_CONCURRENT_PER_DIRECTION) return;
    const next = Array.from(transfers.values())
      .filter((t) => t.snapshot.direction === 'send' && t.snapshot.status === 'queued')
      .sort((a, b) => a.snapshot.createdAt - b.snapshot.createdAt)[0];
    if (!next) return;
    const device = discovery.getDevice(next.snapshot.deviceId);
    if (!device) return; // device went offline; stays queued until it's seen again
    void runSend(next, device);
  }

  async function handleIncomingConnection(conn: TlsConnection) {
    // A connection carries exactly one transfer at a time (one OFFER or
    // RESUME per connection); this is set as soon as we know which, so
    // onProgress/onFileDone below never have to guess by index alone across
    // possibly-concurrent transfers.
    let activeTransferId: TransferId | undefined;
    // Created upfront so the running session can listen for an abort from the
    // very first frame, then attached to whichever transfer this connection
    // turns out to carry as soon as OFFER/RESUME tells us (below).
    const connectionControl = createSessionControl();

    await runReceiverSession(conn.socket as never, {
      fs,
      logger,
      destinationRoot: settings.get().downloadDir,
      control: connectionControl,
      hello: { appVersion: platform.appVersion(), deviceId: identity.deviceId, name: identity.name, os: identity.os },
      onResumeRequest: (transferId) => {
        // The peer (a receiver of ours) is asking us to reconnect and resume
        // sending. We are the original sender; look up our outbound record.
        const t = transfers.get(transferId);
        const outboundDevice = t ? discovery.getDevice(t.snapshot.deviceId) : undefined;
        if (t && outboundDevice && t.snapshot.direction === 'send') {
          void runSend(t, outboundDevice);
        }
      },
      onProgress: (index, delta) => {
        const t = activeTransferId ? transfers.get(activeTransferId) : undefined;
        if (!t) return;
        const fstate = fileState(t, index);
        if (!fstate) return;
        fstate.bytesDone += delta;
        t.snapshot.bytesDone += delta;
        emitUpdate(t);
      },
      onFileDone: (index, ok, reason) => {
        const t = activeTransferId ? transfers.get(activeTransferId) : undefined;
        if (!t) return;
        const fstate = fileState(t, index);
        if (fstate) {
          fstate.status = ok ? 'verified' : 'failed';
          fstate.reason = reason;
        }
        maybeFinish(t);
      },
      onResume: async (transferId) => {
        const t = transfers.get(transferId);
        if (!t || t.snapshot.direction !== 'receive' || !t.destinationRoot) return null;
        activeTransferId = transferId;
        t.control = connectionControl;
        setStatus(t, 'active');
        return { items: t.items, destinationRoot: t.destinationRoot };
      },
      onOffer: async (offer) => {
        activeTransferId = offer.transferId;
        for (const item of offer.items) {
          if (!isValidRelPath(item.relPath)) return { accept: false };
        }
        if (activeCount('receive') >= MAX_CONCURRENT_PER_DIRECTION) {
          return { accept: false, declineReason: 'busy' };
        }
        const fingerprint = conn.peer.fingerprint;
        const device = discovery.listDevices().find((d) => d.fingerprint === fingerprint);
        const deviceName = device?.name ?? 'Unknown device';
        const trusted = trust.isTrusted(fingerprint);

        const transferId = offer.transferId;
        const files = offer.items.filter((i) => i.kind === 'file');
        const snapshot: TransferSnapshot = {
          id: transferId,
          direction: 'receive',
          deviceId: device?.id ?? fingerprint,
          deviceName,
          status: 'awaiting-accept',
          totalBytes: offer.totalBytes,
          bytesDone: 0,
          fileCount: offer.fileCount,
          speedBps: 0,
          files: files.map((item) => ({ item, status: 'queued', bytesDone: 0 })),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        transfers.set(transferId, {
          snapshot,
          items: offer.items,
          destinationRoot: settings.get().downloadDir,
          control: connectionControl,
        });

        if (trusted && settings.get().autoAcceptTrusted) {
          setStatus(transfers.get(transferId)!, 'active');
          return { accept: true, offsets: {} };
        }

        const offerId = randomUUID();
        const incoming: IncomingOffer = {
          offerId,
          transferId,
          deviceId: device?.id ?? fingerprint,
          deviceName,
          deviceOs: device?.os ?? 'unknown',
          linkType: device?.linkType ?? 'wired',
          shortId: device?.shortId ?? fingerprint.slice(0, 8),
          items: offer.items,
          totalBytes: offer.totalBytes,
          fileCount: offer.fileCount,
          destinationDir: settings.get().downloadDir,
          expiresAt: Date.now() + OFFER_TIMEOUT_MS,
        };

        events.emit('offerIncoming', incoming);

        return new Promise<{ accept: boolean; offsets?: Record<number, number> }>((resolve) => {
          const timer = setTimeout(() => {
            pendingOffers.delete(offerId);
            events.emit('offerClosed', { offerId });
            resolve({ accept: false });
          }, OFFER_TIMEOUT_MS);
          pendingOffers.set(offerId, { offer: incoming, resolve, timer });
        }).then((r) => {
          if (r.accept) setStatus(transfers.get(transferId)!, 'active');
          else transfers.delete(transferId);
          return r;
        });
      },
    });
  }

  function maybeFinish(t: InternalTransfer) {
    const allDone = t.snapshot.files.every((f) => f.status === 'verified' || f.status === 'failed');
    if (!allDone) return;
    const anyFailed = t.snapshot.files.some((f) => f.status === 'failed');
    setStatus(t, anyFailed ? 'completed-with-errors' : 'completed');
    stats.recordDeviceBytes(t.snapshot.deviceId, t.snapshot.deviceName, 'wired', t.snapshot.bytesDone);
  }

  async function runSend(t: InternalTransfer, device: Device) {
    // Anything other than a first attempt from 'queued' is a reconnect: send
    // RESUME instead of a fresh OFFER, so the receiver reports real per-file
    // offsets from disk (spec §5.7) instead of restarting from zero.
    const isResume = t.snapshot.status !== 'queued';
    setStatus(t, 'active');
    const control = createSessionControl();
    t.control = control;
    try {
      const conn = await connectToDevice(tls, identity, device);
      const identityCheck = trust.checkIdentity(device.id, conn.peer.fingerprint);
      if (identityCheck === 'changed') {
        setStatus(t, 'failed');
        t.snapshot.error = 'This device’s identity changed';
        emitUpdate(t);
        conn.close();
        return;
      }

      await runSenderSession(conn.socket as never, {
        fs,
        logger,
        transferId: t.snapshot.id,
        items: t.items,
        control,
        resume: isResume,
        hello: { appVersion: platform.appVersion(), deviceId: identity.deviceId, name: identity.name, os: identity.os },
        onIncompatibleVersion: (peerAppVersion) => {
          setStatus(t, 'failed');
          t.snapshot.error = `Update EtherTransfer on ${t.snapshot.deviceName} (running ${peerAppVersion})`;
          emitUpdate(t);
        },
        alreadyVerified: new Set(
          t.snapshot.files.filter((f) => f.status === 'verified').map((f) => f.item.index),
        ),
        sourceOf: (index) => {
          const abs = t.sources?.get(index);
          const item = t.items.find((i) => i.index === index);
          return abs && item ? { item, absolutePath: abs } : undefined;
        },
        onProgress: (index, delta) => {
          const fstate = fileState(t, index);
          if (!fstate) return;
          fstate.status = 'sending';
          fstate.bytesDone += delta;
          t.snapshot.bytesDone += delta;
          emitUpdate(t);
        },
        onFileDone: (index, ok, reason) => {
          const fstate = fileState(t, index);
          if (fstate) {
            fstate.status = ok ? 'verified' : 'failed';
            fstate.reason = reason;
          }
          maybeFinish(t);
        },
        onDeclined: (reason) => {
          if (reason === 'busy' && (t.busyRetries ?? 0) < BUSY_RETRY_MAX_ATTEMPTS) {
            // Re-queue and retry after a delay (spec §5.8), rather than
            // failing outright the first time the receiver is at capacity.
            t.busyRetries = (t.busyRetries ?? 0) + 1;
            setStatus(t, 'queued');
            setTimeout(() => {
              const device2 = discovery.getDevice(t.snapshot.deviceId);
              if (device2 && t.snapshot.status === 'queued') void runSend(t, device2);
            }, BUSY_RETRY_DELAY_MS);
            return;
          }
          setStatus(t, 'declined');
          t.snapshot.error = reason === 'busy' ? 'Device busy' : reason;
          emitUpdate(t);
        },
      });
      conn.close();
    } catch (err) {
      logger.warn('send failed', { err: String(err) });
      setStatus(t, 'interrupted');
    } finally {
      processSendQueue();
    }
  }

  return {
    events,
    port: () => serverPort,

    async send(deviceId, absolutePaths) {
      const device = discovery.getDevice(deviceId);
      if (!device) throw new Error('device-not-found');

      const built = await deps.buildFileList(absolutePaths);
      const items: TransferItem[] = built.map(({ index, relPath, kind, size, mtimeMs }) => ({
        index,
        relPath,
        kind,
        size,
        mtimeMs,
      }));
      const transferId = randomUUID();
      const files = items.filter((i) => i.kind === 'file');
      const totalBytes = files.reduce((s, f) => s + f.size, 0);

      const snapshot: TransferSnapshot = {
        id: transferId,
        direction: 'send',
        deviceId,
        deviceName: device.name,
        status: 'queued',
        totalBytes,
        bytesDone: 0,
        fileCount: files.length,
        speedBps: 0,
        files: files.map((item) => ({ item, status: 'queued', bytesDone: 0 })),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const internal: InternalTransfer = { snapshot, items, sources: built.sources };
      transfers.set(transferId, internal);
      emitUpdate(internal);
      // Starts immediately if a slot is free, otherwise waits in the queue
      // (spec §5.8: at most 3 concurrent outbound transfers).
      processSendQueue();
      return transferId;
    },

    async respondToOffer(offerId, accept, trustDevice) {
      const pending = pendingOffers.get(offerId);
      if (!pending) return;
      clearTimeout(pending.timer as NodeJS.Timeout);
      pendingOffers.delete(offerId);
      if (trustDevice) {
        await trust.trust({
          fingerprint: pending.offer.deviceId,
          deviceId: pending.offer.deviceId,
          name: pending.offer.deviceName,
        });
      }
      pending.resolve({ accept, offsets: {} });
      events.emit('offerClosed', { offerId });
    },

    async pause(id) {
      const t = transfers.get(id);
      if (!t) return;
      // requestPause() takes effect on the live connection immediately;
      // setStatus reflects it in the UI right away rather than waiting for
      // the session to unwind and report back.
      t.control?.requestPause();
      setStatus(t, 'paused');
    },
    async resume(id) {
      const t = transfers.get(id);
      const device = t ? discovery.getDevice(t.snapshot.deviceId) : undefined;
      if (!t || !device) return;
      if (t.snapshot.direction === 'send') {
        void runSend(t, device);
      } else {
        // Receiver can't push data itself; ask the original sender to
        // reconnect and resume (spec §5.7 "Receiver paused" -> RESUME_REQUEST).
        try {
          await sendResumeRequest(tls, identity, platform.appVersion(), device, id);
        } catch (err) {
          logger.warn('resume request failed', { err: String(err) });
        }
      }
    },
    async cancel(id) {
      const t = transfers.get(id);
      if (!t) return;
      t.control?.requestCancel();
      setStatus(t, 'cancelled');
    },
    async retry(id) {
      const t = transfers.get(id);
      const device = t ? discovery.getDevice(t.snapshot.deviceId) : undefined;
      if (t && device && t.snapshot.direction === 'send') void runSend(t, device);
    },
    async discard(id) {
      transfers.delete(id);
    },

    list: () => Array.from(transfers.values()).map((t) => t.snapshot),

    async start() {
      const handle = await startTransferServer({
        tls,
        identity,
        trust,
        logger,
        preferredPort: 47800,
        onConnection: (conn) => void handleIncomingConnection(conn),
      });
      serverPort = handle.port;
    },

    async stop() {
      // Server handle is not retained beyond start(); acceptable for v1 shutdown via process exit.
    },
  };
}
