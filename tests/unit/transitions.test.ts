import { describe, it, expect } from 'vitest';
import { canTransition } from '../../src/core/transfer/logic/transitions';

describe('canTransition', () => {
  it('allows queued to become active', () => {
    expect(canTransition('queued', 'active')).toBe(true);
  });

  it('allows active to pause and resume', () => {
    expect(canTransition('active', 'paused')).toBe(true);
    expect(canTransition('paused', 'active')).toBe(true);
  });

  it('allows active to become interrupted and resume', () => {
    expect(canTransition('active', 'interrupted')).toBe(true);
    expect(canTransition('interrupted', 'active')).toBe(true);
  });

  it('disallows leaving a terminal completed state', () => {
    expect(canTransition('completed', 'active')).toBe(false);
    expect(canTransition('completed', 'failed')).toBe(false);
  });

  it('disallows leaving cancelled', () => {
    expect(canTransition('cancelled', 'active')).toBe(false);
  });

  it('allows retrying a failed transfer by requeueing', () => {
    expect(canTransition('failed', 'queued')).toBe(true);
  });

  it('disallows skipping straight from queued to completed', () => {
    expect(canTransition('queued', 'completed')).toBe(false);
  });
});
