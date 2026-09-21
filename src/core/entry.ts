/**
 * utilityProcess entry point. Pure Node — no `electron` import. Receives a
 * MessagePort from main (first parentPort message) and speaks a tiny RPC
 * protocol: { kind: 'call', callId, method, args } / { kind: 'result', ... }
 * / { kind: 'event', name, payload }.
 */
import { createCore } from './index';

interface CallMessage {
  kind: 'call';
  callId: string;
  method: string;
  args: unknown[];
}

const dataDir = process.env.ETHERTRANSFER_DATA_DIR ?? process.cwd();
const appVersion = process.env.ETHERTRANSFER_VERSION ?? '0.1.0';

/**
 * Node terminates on an unhandled rejection by default. In this process that
 * meant one stray promise - a beacon reply, a dropped connection - killed the
 * whole core, which the UI saw as every device disappearing and every transfer
 * stopping at once. Discovery and transfers are both best-effort by nature, so
 * log and keep running instead.
 */
process.on('unhandledRejection', (reason) => {
  console.error('[core] unhandled rejection', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[core] uncaught exception', err);
});

type NodeMessagePort = {
  postMessage(msg: unknown): void;
  on(event: 'message', listener: (msg: { data: unknown }) => void): void;
  start(): void;
};

const parentPort = (process as unknown as {
  parentPort: {
    once(event: 'message', listener: (e: { ports: NodeMessagePort[] }) => void): void;
  };
}).parentPort;

parentPort.once('message', async (e) => {
  const port = e.ports[0];
  if (!port) return;

  const core = await createCore(dataDir, appVersion);

  const eventNames = [
    'devices:changed',
    'transfer:updated',
    'offer:incoming',
    'offer:closed',
    'stats:tick',
    'core:status',
  ] as const;
  for (const name of eventNames) {
    core.onEvent(name, (payload) => {
      port.postMessage({ kind: 'event', name, payload });
    });
  }

  port.on('message', async (msg: { data: unknown }) => {
    const call = msg.data as CallMessage;
    if (call.kind !== 'call') return;
    try {
      const fn = (core.api as unknown as Record<string, (...a: unknown[]) => unknown>)[call.method];
      if (typeof fn !== 'function') throw new Error(`unknown method: ${call.method}`);
      const result = await fn(...call.args);
      port.postMessage({ kind: 'result', callId: call.callId, result });
    } catch (err) {
      port.postMessage({ kind: 'result', callId: call.callId, error: String(err) });
    }
  });
  port.start();

  await core.start();
  port.postMessage({ kind: 'event', name: 'core:status', payload: { connected: true, reconnecting: false } });
});
