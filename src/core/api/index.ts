import type { DiscoveryService } from '../discovery';
import type { TransferService } from '../transfer';
import type { SettingsService } from '../settings';
import type { StatsService } from '../stats';
import type { TrustService } from '../trust';
import type { CoreCommands } from '../../shared/ipc-contract';
import type { Device, Settings, StatsRange } from '../../shared/types';

export interface CoreApiDeps {
  discovery: DiscoveryService;
  transfer: TransferService;
  settings: SettingsService;
  stats: StatsService;
  trust: TrustService;
}

/** Maps ipc-contract commands to module services. The only file that knows the contract. */
export function createCoreApi(deps: CoreApiDeps): CoreCommands {
  const { discovery, transfer, settings, stats, trust } = deps;

  function toDeviceView(): Device[] {
    return discovery.listDevices();
  }

  return {
    async getSnapshot() {
      return {
        devices: toDeviceView(),
        transfers: transfer.list(),
        offers: [],
        settings: settings.get(),
      };
    },
    async sendFiles(deviceId, paths) {
      return transfer.send(deviceId, paths);
    },
    async connectByAddress(address, port = 47800) {
      await discovery.connectByAddress(address, port);
    },
    async respondToOffer(offerId, accept, trustDevice) {
      await transfer.respondToOffer(offerId, accept, trustDevice);
    },
    async pauseTransfer(id) {
      await transfer.pause(id);
    },
    async resumeTransfer(id) {
      await transfer.resume(id);
    },
    async cancelTransfer(id) {
      await transfer.cancel(id);
    },
    async retryTransfer(id) {
      await transfer.retry(id);
    },
    async discardTransfer(id) {
      await transfer.discard(id);
    },
    async setTrusted(deviceId, trusted) {
      const device = discovery.getDevice(deviceId);
      if (!device) return;
      if (trusted) await trust.trust({ fingerprint: device.fingerprint, deviceId, name: device.name });
      else await trust.untrust(device.fingerprint);
    },
    async getSettings() {
      return settings.get();
    },
    async updateSettings(patch: Partial<Settings>) {
      return settings.update(patch);
    },
    async getStats(range: StatsRange) {
      return stats.snapshot(range);
    },
    async getDiagnostics() {
      const s = settings.get();
      const devices = toDeviceView();
      return JSON.stringify(
        {
          settings: { ...s, downloadDir: '~/Downloads/EtherTransfer' },
          deviceCount: devices.length,
          devices: devices.map((d) => ({ name: d.name, os: d.os, linkType: d.linkType })),
        },
        null,
        2,
      );
    },
  };
}
