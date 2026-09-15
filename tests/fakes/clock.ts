import type { Clock } from '../../src/core/ports';

/** Deterministic fake clock: time only advances when the test calls advance(). */
export function createFakeClock(): Clock & { advance(ms: number): void } {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { fn: () => void; interval: number | null; due: number }>();

  return {
    now: () => now,
    setInterval(fn, ms) {
      const id = nextId++;
      timers.set(id, { fn, interval: ms, due: now + ms });
      return id;
    },
    clearInterval(handle) {
      timers.delete(handle as number);
    },
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.set(id, { fn, interval: null, due: now + ms });
      return id;
    },
    clearTimeout(handle) {
      timers.delete(handle as number);
    },
    advance(ms: number) {
      const target = now + ms;
      while (true) {
        const due = Array.from(timers.entries())
          .filter(([, t]) => t.due <= target)
          .sort((a, b) => a[1].due - b[1].due)[0];
        if (!due) break;
        const [id, timer] = due;
        now = timer.due;
        timer.fn();
        if (timer.interval != null && timers.has(id)) {
          timer.due = now + timer.interval;
        } else {
          timers.delete(id);
        }
      }
      now = target;
    },
  };
}
