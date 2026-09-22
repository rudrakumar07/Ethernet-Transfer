export interface ThroughputSample {
  sent: number;
  received: number;
}

/**
 * Samples kept for the Home screen's live throughput sparkline. The core
 * reports every 500 ms, so this is the last minute.
 */
export const THROUGHPUT_WINDOW = 120;

/** Appends a sample, dropping the oldest once the window is full. Never mutates. */
export function pushSample(history: ThroughputSample[], sample: ThroughputSample): ThroughputSample[] {
  const next = history.length >= THROUGHPUT_WINDOW ? history.slice(history.length - THROUGHPUT_WINDOW + 1) : history.slice();
  next.push(sample);
  return next;
}

export function peakOf(history: ThroughputSample[]): number {
  let peak = 0;
  for (const s of history) peak = Math.max(peak, s.sent, s.received);
  return peak;
}
