import { describe, it, expect } from 'vitest';
import { createHarness } from '../fakes/service-harness';

/**
 * Regression coverage for Dismiss doing nothing: discard() deleted the record
 * in the core but emitted no event. The renderer only mirrors transfers via
 * 'updated', which can add or replace a row but never remove one, so the row
 * stayed on screen while the core had already forgotten it - and clicking
 * Dismiss again was a no-op on an id the core no longer knew.
 */
describe('discarding a transfer', () => {
  it('announces the removal so the UI can drop the row', async () => {
    const h = createHarness({ connect: async () => { throw new Error('offline'); } });
    const removed: string[] = [];
    h.service.events.on('removed', ({ id }) => removed.push(id));

    const id = await h.service.send('dev-1', ['/src/a.bin']);
    await new Promise((r) => setTimeout(r, 30));

    await h.service.discard(id);

    expect(removed).toEqual([id]);
    expect(h.service.list().find((t) => t.id === id)).toBeUndefined();
  });

  it('still announces removal for an id the core has already forgotten', async () => {
    // A row left behind by the old bug must be clearable, not stuck forever.
    const h = createHarness();
    const removed: string[] = [];
    h.service.events.on('removed', ({ id }) => removed.push(id));

    await h.service.discard('stale-id');

    expect(removed).toEqual(['stale-id']);
  });
});
