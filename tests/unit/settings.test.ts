import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { createSettingsService } from '../../src/core/settings';
import { createFakeFileSystem } from '../fakes/filesystem';
import { createFakePlatform } from '../fakes/platform';

describe('SettingsService', () => {
  it('creates sane defaults on first run, including a real Downloads path', async () => {
    const home = path.join('home', 'rudra');
    const settings = await createSettingsService({
      fs: createFakeFileSystem(),
      platform: createFakePlatform({ homeDir: home }),
    });
    // Regression test for the bug caught during build: the default must be
    // under the user's real home directory, not the Electron data directory.
    expect(settings.get().downloadDir).toBe(path.join(home, 'Downloads', 'EtherTransfer'));
    expect(settings.get().autoAcceptTrusted).toBe(true);
  });

  it('persists updates and merges them into the current settings', async () => {
    const settings = await createSettingsService({ fs: createFakeFileSystem(), platform: createFakePlatform() });
    const updated = await settings.update({ deviceName: 'New Name' });
    expect(updated.deviceName).toBe('New Name');
    expect(settings.get().deviceName).toBe('New Name');
  });

  it('emits a changed event on update', async () => {
    const settings = await createSettingsService({ fs: createFakeFileSystem(), platform: createFakePlatform() });
    let seen: string | undefined;
    settings.events.on('changed', (s) => (seen = s.deviceName));
    await settings.update({ deviceName: 'Renamed' });
    expect(seen).toBe('Renamed');
  });

  it('loads persisted settings on a subsequent start', async () => {
    const fs = createFakeFileSystem();
    const platform = createFakePlatform();
    const first = await createSettingsService({ fs, platform });
    await first.update({ deviceName: 'Persisted Name' });

    const second = await createSettingsService({ fs, platform });
    expect(second.get().deviceName).toBe('Persisted Name');
  });
});
