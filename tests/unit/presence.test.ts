import { describe, it, expect } from 'vitest';
import { isOnline, PRESENCE_TIMEOUT_MS } from '../../src/core/discovery/logic/presence';

describe('isOnline', () => {
  it('is online right after being seen', () => {
    expect(isOnline(1000, 1000)).toBe(true);
  });

  it('is still online just under the timeout', () => {
    expect(isOnline(1000, 1000 + PRESENCE_TIMEOUT_MS - 1)).toBe(true);
  });

  it('is offline once the timeout has elapsed', () => {
    expect(isOnline(1000, 1000 + PRESENCE_TIMEOUT_MS + 1)).toBe(false);
  });
});
