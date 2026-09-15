import path from 'node:path';
import type { FileSystem, Platform } from '../ports';
import { TypedEmitter } from '../../shared/typed-emitter';
import type { Settings } from '../../shared/types';

export interface SettingsEvents {
  changed: Settings;
}

export interface SettingsService {
  get(): Settings;
  update(patch: Partial<Settings>): Promise<Settings>;
  events: TypedEmitter<SettingsEvents>;
}

export interface SettingsDeps {
  fs: FileSystem;
  platform: Platform;
}

function defaultSettings(platform: Platform): Settings {
  return {
    deviceName: platform.hostname(),
    downloadDir: path.join(platform.homeDir(), 'Downloads', 'EtherTransfer'),
    autoAcceptTrusted: true,
    theme: 'system',
    startOnLogin: false,
    minimizeToTray: true,
    ignoredInterfaces: [],
    manualDevices: [],
  };
}

export async function createSettingsService(deps: SettingsDeps): Promise<SettingsService> {
  const { fs, platform } = deps;
  const filePath = path.join(platform.dataDir(), 'settings.json');
  const events = new TypedEmitter<SettingsEvents>();

  const loaded = await fs.readJson<Settings>(filePath);
  let current: Settings = { ...defaultSettings(platform), ...(loaded ?? {}) };
  if (!loaded) {
    await fs.writeJsonAtomic(filePath, current);
  }

  return {
    get: () => current,
    async update(patch) {
      current = { ...current, ...patch };
      await fs.writeJsonAtomic(filePath, current);
      events.emit('changed', current);
      return current;
    },
    events,
  };
}
