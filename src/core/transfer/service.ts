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
import { endGracefully } from './protocol/flow-control';
import { canTransition } from './logic/transitions';
import { isValidRelPath } from './logic/path-validator';
import { MAX_ITEMS_PER_TRANSFER } from './build-file-list';

export interface TransferEvents {
  updated: TransferSnapshot;
  /** A transfer was dropped from the list; the UI removes its row. */
  removed: { id: TransferId };
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
  /** Combined live rate of all active transfers, per direction. */
  throughput(): { sentBps: number; receivedBps: number };
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
  buildFileList: (
    absolutePaths: string[],
    options?: { onProgress?: (filesScanned: number, bytesScanned: number) => void },
  ) => Promise<TransferItem[] & { sources: Map<number, string> }>;
}

const MAX_CONCURRENT_PER_DIRECTION = 3;
const PREFERRED_TRANSFER_PORT = 47800;
const OFFER_TIMEOUT_MS = 60_000;

const BUSY_RETRY_DELAY_MS = 10_000;
const BUSY_RETRY_MAX_ATTEMPTS = 5;

/**
 * Progress updates are coalesced into at most one event per this interval.
 *
 * Every DATA chunk used to emit a full snapshot. On a 20,000-file folder that
 * was ~60,000 events, each carrying the whole 20,000-entry files array: the
 * core process became CPU-bound on serialisation, the window stopped
 * responding, and the transfer itself stalled part-way through.
 */
const UPDATE_COALESCE_MS = 120;

/** Above this many files, progress events carry aggregates only. */
const FILES_INLINE_LIMIT = 200;

/** Minimum gap between speed samples; shorter windows are mostly jitter. */
const SPEED_SAMPLE_MS = 50;
/** Weight given to the newest sample; the rest carries the previous estimate. */
const SPEED_SMOOTHING = 0.4;

interface SpeedSampler {
  lastBytes: number;
  lastAt: number;
}

interface InternalTransfer {
  snapshot: TransferSnapshot;
  items: TransferItem[];
  sources?: Map<number, string>; // sender: index -> absolute path
  destinationRoot?: string;
  /** Certificate fingerprint of the peer on the connection that carried this transfer. */
  peerFingerprint?: string;
  /** The files and folders originally chosen, so a failed scan can be rescanned. */
  sourcePaths?: string[];
  speed?: SpeedSampler;
  /** Set while a connection for this transfer is actually live; lets pause()/cancel() take effect immediately. */
  control?: SessionControl;
  /** How many times a DECLINE busy has already been retried (spec §5.8). */
  busyRetries?: number;
}

export function createTransferService(deps: TransferDeps): TransferService {
  const { fs, platform, tls, identity, trust, discovery, settings, stats, logger } = deps;
  const events = new TypedEmitter<TransferEvents>();
  const transfers = new Map<TransferId, InternalTransfer>();
  const pendingOffers = new Map<
    string,
    {
      offer: IncomingOffer;
      resolve: (r: { accept: boolean; offsets?: Record<number, number> }) => void;
      timer: unknown;
      /** Peer certificate fingerprint - the only stable identity to trust by. */
      fingerprint: string;
    }
  >();
  let serverPort = 0;
  let server: { port: number; close(): Promise<void> } | undefined;

  const pendingEmits = new Map<TransferId, NodeJS.Timeout>();

  function cancelPendingEmit(id: TransferId) {
    const timer = pendingEmits.get(id);
    if (timer) {
      clearTimeout(timer);
      pendingEmits.delete(id);
    }
  }

  /** Emits straight away. `full` forces the per-file array to be included. */
  function emitNow(t: InternalTransfer, full: boolean) {
    cancelPendingEmit(t.snapshot.id);
    t.snapshot.updatedAt = Date.now();
    const omitFiles = !full && t.snapshot.files.length > FILES_INLINE_LIMIT;
    events.emit('updated', omitFiles ? { ...t.snapshot, files: [], filesOmitted: true } : t.snapshot);
  }

  /** Coalesced: rapid progress collapses into one trailing event per interval. */
  function emitUpdate(t: InternalTransfer) {
    if (pendingEmits.has(t.snapshot.id)) return;
    const timer = setTimeout(() => {
      pendingEmits.delete(t.snapshot.id);
      emitNow(t, false);
    }, UPDATE_COALESCE_MS);
    timer.unref?.();
    pendingEmits.set(t.snapshot.id, timer);
  }

  /**
   * Records transferred bytes and derives the live rate and ETA.
   *
   * speedBps used to be hard-coded to 0 and stats.recordThroughput() was never
   * called from anywhere, so the transfer bar permanently read "0 MB/s".
   */
  function recordProgress(t: InternalTransfer, delta: number) {
    const now = Date.now();
    const sampler = (t.speed ??= { lastBytes: t.snapshot.bytesDone, lastAt: now });
    const elapsed = now - sampler.lastAt;
    if (elapsed >= SPEED_SAMPLE_MS) {
      const instant = ((t.snapshot.bytesDone - sampler.lastBytes) * 1000) / elapsed;
      t.snapshot.speedBps = t.snapshot.speedBps
        ? t.snapshot.speedBps * (1 - SPEED_SMOOTHING) + instant * SPEED_SMOOTHING
        : instant;
      sampler.lastBytes = t.snapshot.bytesDone;
      sampler.lastAt = now;
    }
    const remaining = Math.max(0, t.snapshot.totalBytes - t.snapshot.bytesDone);
    t.snapshot.etaSeconds = t.snapshot.speedBps > 0 ? remaining / t.snapshot.speedBps : undefined;
    // Bytes moving over a live connection are proof the peer is still there;
    // without this a link busy enough to delay beacons could drop the very
    // device it is transferring with, and the transfer would fail with it.
    discovery.markSeen(t.snapshot.deviceId);
    void delta;
  }

  /** Total live throughput per direction, for the stats service. */
  function throughput(): { sentBps: number; receivedBps: number } {
    let sentBps = 0;
    let receivedBps = 0;
    for (const t of transfers.values()) {
      if (t.snapshot.status !== 'active') continue;
      if (t.snapshot.direction === 'send') sentBps += t.snapshot.speedBps;
      else receivedBps += t.snapshot.speedBps;
    }
    return { sentBps, receivedBps };
  }

  function setStatus(t: InternalTransfer, status: TransferStatus) {
    if (!canTransition(t.snapshot.status, status)) {
      logger.warn('invalid transfer transition', { from: t.snapshot.status, to: status });
    }
    t.snapshot.status = status;
    // A status change is never delayed or trimmed: it is what the UI keys off.
    emitNow(t, true);
  }

  function fileState(t: InternalTransfer, index: number): TransferFileState | undefined {
    return t.snapshot.files.find((f) => f.item.index === index);
  }

  /**
   * The transfer total is the sum of its files' absolute progress, never a
   * running counter. Accumulating deltas globally double-counted every byte a
   * resume replayed - a paused-then-resumed 200 MiB file reported 419 MB done.
   */
  function recountBytes(t: InternalTransfer) {
    t.snapshot.bytesDone = t.snapshot.files.reduce((sum, f) => sum + f.bytesDone, 0);
  }

  /** A file (re)started at an absolute offset: set its progress, don't add to it. */
  function setFileOffset(t: InternalTransfer, index: number, offset: number) {
    const fstate = fileState(t, index);
    if (!fstate) return;
    fstate.bytesDone = Math.min(offset, fstate.item.size);
    recountBytes(t);
    t.speed = undefined; // the rate estimate restarts with the file
    emitUpdate(t);
  }

  /** Bytes just moved for one file. */
  function addFileBytes(t: InternalTransfer, index: number, delta: number) {
    const fstate = fileState(t, index);
    if (!fstate) return false;
    fstate.bytesDone = Math.min(fstate.bytesDone + delta, fstate.item.size);
    recountBytes(t);
    return true;
  }

  /**
   * Only a paused or interrupted transfer can be resumed. Resuming without
   * this check let a double-click start two sessions writing into the same
   * .etpart, and let a late resume request from the receiver revive a send
   * that had already been cancelled or had finished.
   */
  function isResumable(t: InternalTransfer): boolean {
    return t.snapshot.status === 'paused' || t.snapshot.status === 'interrupted';
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
    void runSend(next, device).catch((err) => logger.warn('send failed', { err: String(err) }));
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
    let peerCancelled = false;
    let peerDone = false;

    await runReceiverSession(conn.socket as never, {
      fs,
      logger,
      destinationRoot: settings.get().downloadDir,
      control: connectionControl,
      hello: { appVersion: platform.appVersion(), deviceId: identity.deviceId, name: identity.name, os: identity.os },
      onPeerCancelled: () => {
        peerCancelled = true;
      },
      onPeerDone: () => {
        peerDone = true;
      },
      onResumeRequest: (transferId) => {
        // The peer (a receiver of ours) is asking us to reconnect and resume
        // sending. We are the original sender; look up our outbound record.
        const t = transfers.get(transferId);
        const outboundDevice = t ? discovery.getDevice(t.snapshot.deviceId) : undefined;
        if (t && outboundDevice && t.snapshot.direction === 'send' && isResumable(t)) {
          void runSend(t, outboundDevice).catch((err) =>
            logger.warn('resume send failed', { err: String(err) }),
          );
        }
      },
      onProgress: (index, delta) => {
        const t = activeTransferId ? transfers.get(activeTransferId) : undefined;
        if (!t) return;
        if (!addFileBytes(t, index, delta)) return;
        recordProgress(t, delta);
        emitUpdate(t);
      },
      onFileOffset: (index, offset) => {
        const t = activeTransferId ? transfers.get(activeTransferId) : undefined;
        if (t) setFileOffset(t, index, offset);
      },
      onFileDone: (index, ok, reason) => {
        const t = activeTransferId ? transfers.get(activeTransferId) : undefined;
        if (!t) return;
        const fstate = fileState(t, index);
        if (fstate) {
          fstate.status = ok ? 'verified' : 'failed';
          fstate.reason = reason;
          if (ok) fstate.bytesDone = fstate.item.size;
          recountBytes(t);
        }
        maybeFinish(t);
      },
      onResume: async (transferId) => {
        const t = transfers.get(transferId);
        if (!t || t.snapshot.direction !== 'receive' || !t.destinationRoot || !isResumable(t)) return null;
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
          peerFingerprint: fingerprint,
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

        // If the sender cancels or its connection drops while the prompt is
        // up, close the prompt: otherwise it kept counting down for a minute
        // and Accept produced a transfer on a connection that no longer existed.
        let onSenderGone: () => void = () => undefined;
        return new Promise<{ accept: boolean; offsets?: Record<number, number> }>((resolve) => {
          const close = () => {
            if (!pendingOffers.delete(offerId)) return;
            clearTimeout(timer);
            events.emit('offerClosed', { offerId });
            resolve({ accept: false });
          };
          const timer = setTimeout(close, OFFER_TIMEOUT_MS);
          onSenderGone = close;
          conn.socket.once('close', onSenderGone);
          pendingOffers.set(offerId, { offer: incoming, resolve, timer, fingerprint });
        }).then((r) => {
          conn.socket.removeListener('close', onSenderGone);
          if (r.accept) setStatus(transfers.get(transferId)!, 'active');
          else transfers.delete(transferId);
          return r;
        });
      },
    });

    // The connection is over. An inbound transfer that is still running has
    // lost its only data source, so it has to reach a terminal state here -
    // otherwise it sits at "active" forever with no way to resume or dismiss,
    // which is exactly how a cancelled or dropped transfer used to look.
    const t = activeTransferId ? transfers.get(activeTransferId) : undefined;
    if (t && (t.snapshot.status === 'active' || t.snapshot.status === 'awaiting-accept')) {
      t.snapshot.speedBps = 0;
      t.snapshot.etaSeconds = undefined;
      t.speed = undefined;
      if (peerCancelled) {
        // A cancel discards the partial file; a dropped link keeps it so the
        // transfer can pick up where it left off.
        setStatus(t, 'cancelled');
      } else if (peerDone && t.snapshot.files.length === 0) {
        // A folder that contains only folders has nothing to verify - it is
        // finished once the directories exist, not stuck waiting for files.
        setStatus(t, 'completed');
      } else {
        setStatus(t, 'interrupted');
      }
    }
    if (t?.control === connectionControl) t.control = undefined;
  }

  function maybeFinish(t: InternalTransfer) {
    // An empty file list is not a finished transfer - every() is vacuously true
    // on it, which would complete a folder-only transfer before it began.
    if (t.snapshot.files.length === 0) return;
    const allDone = t.snapshot.files.every((f) => f.status === 'verified' || f.status === 'failed');
    if (!allDone) return;
    const anyFailed = t.snapshot.files.some((f) => f.status === 'failed');
    t.snapshot.speedBps = 0;
    t.snapshot.etaSeconds = undefined;
    setStatus(t, anyFailed ? 'completed-with-errors' : 'completed');
    const linkType = discovery.getDevice(t.snapshot.deviceId)?.linkType ?? 'wired';
    stats.recordDeviceBytes(t.snapshot.deviceId, t.snapshot.deviceName, linkType, t.snapshot.bytesDone);
  }

  /** Walks the chosen paths into this transfer's manifest, reporting progress. */
  async function scanInto(t: InternalTransfer, absolutePaths: string[]) {
    try {
      const built = await deps.buildFileList(absolutePaths, {
        onProgress: (filesScanned, bytesScanned) => {
          t.snapshot.fileCount = filesScanned;
          t.snapshot.totalBytes = bytesScanned;
          emitUpdate(t);
        },
      });
      const items: TransferItem[] = built.map(({ index, relPath, kind, size, mtimeMs }) => ({
        index,
        relPath,
        kind,
        size,
        mtimeMs,
      }));
      // Cancelled while the walk was running: leave it cancelled. Setting it to
      // queued here used to revive it, and the send went out anyway.
      if (t.snapshot.status !== 'scanning') return;
      const files = items.filter((i) => i.kind === 'file');
      t.items = items;
      t.sources = built.sources;
      t.snapshot.fileCount = files.length;
      t.snapshot.totalBytes = files.reduce((sum, f) => sum + f.size, 0);
      t.snapshot.files = files.map((item) => ({ item, status: 'queued', bytesDone: 0 }));
      setStatus(t, 'queued');
    } catch (err) {
      if (t.snapshot.status !== 'scanning') return;
      const reason = err instanceof Error ? err.message : String(err);
      t.snapshot.error =
        reason === 'too-many-files'
          ? `That folder has more than ${MAX_ITEMS_PER_TRANSFER.toLocaleString()} items - send it in smaller parts`
          : reason;
      setStatus(t, 'failed');
      throw err;
    }
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

      const outcome = await runSenderSession(conn.socket as never, {
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
        // Only a genuine resume may skip files: a retry sends a fresh OFFER, so
        // the receiver starts a brand-new record and expects every file again.
        alreadyVerified: isResume
          ? new Set(t.snapshot.files.filter((f) => f.status === 'verified').map((f) => f.item.index))
          : new Set<number>(),
        sourceOf: (index) => {
          const abs = t.sources?.get(index);
          const item = t.items.find((i) => i.index === index);
          return abs && item ? { item, absolutePath: abs } : undefined;
        },
        onProgress: (index, delta) => {
          const fstate = fileState(t, index);
          if (!fstate) return;
          fstate.status = 'sending';
          addFileBytes(t, index, delta);
          recordProgress(t, delta);
          emitUpdate(t);
        },
        onFileOffset: (index, offset) => setFileOffset(t, index, offset),
        onFileDone: (index, ok, reason) => {
          const fstate = fileState(t, index);
          if (fstate) {
            fstate.status = ok ? 'verified' : 'failed';
            fstate.reason = reason;
            if (ok) fstate.bytesDone = fstate.item.size;
            recountBytes(t);
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
      // How the session ended decides the status. Every exit used to return
      // nothing, so a dropped link or a pause from the receiver left the
      // transfer "active" forever, with no Resume on offer.
      if (t.snapshot.status === 'active') {
        if (outcome === 'peer-paused') setStatus(t, 'paused');
        else if (outcome === 'peer-cancelled') setStatus(t, 'cancelled');
        else if (outcome === 'connection-lost') setStatus(t, 'interrupted');
        else if (outcome === 'finished' && t.snapshot.files.length === 0) {
          // A folder with no files inside it completes as soon as the manifest
          // has been delivered; there are no files to mark verified.
          setStatus(t, 'completed');
        } else if (outcome === 'finished') maybeFinish(t);
      }
      // Not awaited: the send slot is free as soon as the session is done, and
      // the flush only needs to outlive this function, not block the queue.
      void endGracefully(conn.socket as never, () => conn.close());
    } catch (err) {
      logger.warn('send failed', { err: String(err) });
      setStatus(t, 'interrupted');
    } finally {
      if (t.control === control) t.control = undefined;
      if (t.snapshot.status !== 'active') {
        t.snapshot.speedBps = 0;
        t.snapshot.etaSeconds = undefined;
        t.speed = undefined;
      }
      processSendQueue();
    }
  }

  return {
    events,
    port: () => serverPort,

    async send(deviceId, absolutePaths) {
      const device = discovery.getDevice(deviceId);
      if (!device) throw new Error('device-not-found');

      const transferId = randomUUID();
      // The transfer exists before the walk does. Scanning a large folder takes
      // real time, and without a record to show, picking one looked like
      // nothing had happened at all.
      const internal: InternalTransfer = {
        snapshot: {
          id: transferId,
          direction: 'send',
          deviceId,
          deviceName: device.name,
          status: 'scanning',
          totalBytes: 0,
          bytesDone: 0,
          fileCount: 0,
          speedBps: 0,
          files: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        items: [],
        sourcePaths: absolutePaths,
      };
      transfers.set(transferId, internal);
      emitNow(internal, true);

      await scanInto(internal, absolutePaths);
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
        // The certificate fingerprint is the identity trust is keyed on.
        // Storing the offer's deviceId here (a UUID, or the fingerprint only
        // for an unknown peer) meant isTrusted() could never match afterwards,
        // so "Always accept from this device" silently did nothing.
        await trust.trust({
          fingerprint: pending.fingerprint,
          deviceId: pending.offer.deviceId,
          name: pending.offer.deviceName,
        });
        discovery.refreshTrust();
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
      if (!t || !device || !isResumable(t)) return;
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
      if (!t || t.snapshot.direction !== 'send') return;
      if (t.items.length === 0) {
        // The scan itself failed, so there is no manifest to resend - walk the
        // originally chosen paths again rather than offering an empty transfer.
        if (!t.sourcePaths?.length) return;
        t.snapshot.error = undefined;
        setStatus(t, 'scanning');
        await scanInto(t, t.sourcePaths).catch(() => undefined);
        processSendQueue();
        return;
      }
      // A retry starts over from a fresh OFFER. Going straight to runSend left
      // the status at 'failed', which made it send RESUME instead - and the
      // receiver, having no record of that transfer, replied unknown-transfer.
      t.snapshot.status = 'queued';
      t.snapshot.error = undefined;
      t.snapshot.bytesDone = 0;
      t.snapshot.speedBps = 0;
      t.snapshot.etaSeconds = undefined;
      t.speed = undefined;
      t.busyRetries = 0;
      for (const f of t.snapshot.files) {
        f.status = 'queued';
        f.bytesDone = 0;
        f.reason = undefined;
      }
      emitUpdate(t);
      processSendQueue();
    },
    async discard(id) {
      const t = transfers.get(id);
      // Dropping the record without stopping the session left it running
      // invisibly, still writing bytes with nowhere to report them.
      t?.control?.requestCancel();
      cancelPendingEmit(id);
      transfers.delete(id);
      // Announced even when the id was already gone, so a row the renderer is
      // still showing can always be cleared. Without this event the core
      // forgot the transfer but the row stayed on screen, and Dismiss
      // appeared to do nothing.
      events.emit('removed', { id });
    },

    list: () => Array.from(transfers.values()).map((t) => t.snapshot),

    throughput,

    async start() {
      server = await startTransferServer({
        tls,
        identity,
        trust,
        logger,
        preferredPort: PREFERRED_TRANSFER_PORT,
        onConnection: (conn) => {
          // An unhandled rejection here would terminate the core process, which
          // the UI experiences as every device vanishing at once.
          handleIncomingConnection(conn).catch((err) => {
            logger.warn('incoming connection failed', { err: String(err) });
            conn.close();
          });
        },
      });
      serverPort = server.port;
    },

    async stop() {
      for (const id of Array.from(pendingEmits.keys())) cancelPendingEmit(id);
      for (const t of transfers.values()) t.control?.requestCancel();
      await server?.close();
      server = undefined;
    },
  };
}
