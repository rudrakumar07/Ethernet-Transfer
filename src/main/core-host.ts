import { MessageChannelMain, app, utilityProcess, type UtilityProcess, type MessagePortMain } from 'electron';
import path from 'node:path';
import type { CoreEventName } from '../shared/ipc-contract';

interface PendingCall {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

export interface CoreHost {
  call<T>(method: string, args: unknown[]): Promise<T>;
  on(event: CoreEventName, listener: (payload: unknown) => void): void;
  restart(): void;
}

const RESTART_LIMIT = 3;
const RESTART_WINDOW_MS = 60_000;

export function createCoreHost(): CoreHost {
  let child: UtilityProcess | null = null;
  let rendererPort: MessagePortMain | null = null;
  const pending = new Map<string, PendingCall>();
  const eventListeners = new Map<string, Set<(payload: unknown) => void>>();
  let callCounter = 0;
  const restarts: number[] = [];

  function emit(name: string, payload: unknown) {
    const set = eventListeners.get(name);
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  function spawn() {
    const entryPath = path.join(__dirname, 'core-entry.js');
    child = utilityProcess.fork(entryPath, [], {
      serviceName: 'ethertransfer-core',
      env: {
        ...process.env,
        ETHERTRANSFER_DATA_DIR: app.getPath('userData'),
        ETHERTRANSFER_VERSION: app.getVersion(),
      },
    });

    const { port1, port2 } = new MessageChannelMain();
    child.postMessage('init', [port2]);
    port1.start();
    port1.on('message', (e) => {
      const msg = e.data as { kind: string; callId?: string; result?: unknown; error?: string; name?: string; payload?: unknown };
      if (msg.kind === 'result' && msg.callId) {
        const p = pending.get(msg.callId);
        if (!p) return;
        pending.delete(msg.callId);
        if (msg.error) p.reject(new Error(msg.error));
        else p.resolve(msg.result);
      } else if (msg.kind === 'event' && msg.name) {
        emit(msg.name, msg.payload);
      }
    });
    rendererPort = port1;

    child.once('exit', () => {
      emit('core:status', { connected: false, reconnecting: true });
      const now = Date.now();
      restarts.push(now);
      while (restarts.length && now - restarts[0] > RESTART_WINDOW_MS) restarts.shift();
      if (restarts.length > RESTART_LIMIT) {
        emit('core:status', { connected: false, reconnecting: false });
        return;
      }
      setTimeout(spawn, 500);
    });
  }

  spawn();

  return {
    call<T>(method: string, args: unknown[]): Promise<T> {
      return new Promise((resolve, reject) => {
        const callId = String(++callCounter);
        pending.set(callId, { resolve: resolve as (v: unknown) => void, reject });
        rendererPort?.postMessage({ kind: 'call', callId, method, args });
      });
    },
    on(event, listener) {
      let set = eventListeners.get(event);
      if (!set) {
        set = new Set();
        eventListeners.set(event, set);
      }
      set.add(listener);
    },
    restart() {
      child?.kill();
    },
  };
}
