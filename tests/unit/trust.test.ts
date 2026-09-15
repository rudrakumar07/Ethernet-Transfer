import { describe, it, expect, beforeEach } from 'vitest';
import { createTrustService, type TrustService } from '../../src/core/trust';
import { createFakeFileSystem } from '../fakes/filesystem';
import { createFakePlatform } from '../fakes/platform';

describe('TrustService', () => {
  let trust: TrustService;

  beforeEach(async () => {
    trust = await createTrustService({ fs: createFakeFileSystem(), platform: createFakePlatform() });
  });

  it('reports unknown for a device it has never seen', () => {
    expect(trust.checkIdentity('dev-1', 'fp-1')).toBe('unknown');
  });

  it('reports ok once trusted with the matching fingerprint', async () => {
    await trust.trust({ fingerprint: 'fp-1', deviceId: 'dev-1', name: 'Laptop' });
    expect(trust.checkIdentity('dev-1', 'fp-1')).toBe('ok');
    expect(trust.isTrusted('fp-1')).toBe(true);
  });

  it('reports changed when the same device id presents a different fingerprint', async () => {
    await trust.trust({ fingerprint: 'fp-1', deviceId: 'dev-1', name: 'Laptop' });
    expect(trust.checkIdentity('dev-1', 'fp-2')).toBe('changed');
  });

  it('removes trust on untrust', async () => {
    await trust.trust({ fingerprint: 'fp-1', deviceId: 'dev-1', name: 'Laptop' });
    await trust.untrust('fp-1');
    expect(trust.isTrusted('fp-1')).toBe(false);
    expect(trust.checkIdentity('dev-1', 'fp-1')).toBe('unknown');
  });

  it('persists across service restarts against the same filesystem', async () => {
    const fs = createFakeFileSystem();
    const platform = createFakePlatform();
    const first = await createTrustService({ fs, platform });
    await first.trust({ fingerprint: 'fp-1', deviceId: 'dev-1', name: 'Laptop' });

    const second = await createTrustService({ fs, platform });
    expect(second.isTrusted('fp-1')).toBe(true);
  });
});
