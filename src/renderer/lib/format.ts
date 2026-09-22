import type { Device, LinkType, TransferSnapshot } from '../../shared/types';

/** Human-readable size. Decimal units, matching how drives and OS dialogs report them. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
  return `${Math.round(n)} B`;
}

export function formatSpeed(bytesPerSecond: number): string {
  const safe = Number.isFinite(bytesPerSecond) && bytesPerSecond > 0 ? bytesPerSecond : 0;
  return `${(safe / 1e6).toFixed(1)} MB/s`;
}

/** Remaining time, or null when there is nothing meaningful to say yet. */
export function formatEta(seconds: number | undefined): string | null {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 60) return `${Math.round(seconds)} s left`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min left`;
  return `${(seconds / 3600).toFixed(1)} h left`;
}

export const LINK_LABEL: Record<LinkType, string> = {
  direct: 'Direct cable',
  wired: 'Ethernet',
  wireless: 'Wi-Fi',
};

const LINK_ORDER: LinkType[] = ['direct', 'wired', 'wireless'];
const LINK_PHRASE: Record<LinkType, string> = { direct: 'direct cable', wired: 'Ethernet', wireless: 'Wi-Fi' };

/** "direct cable, Ethernet and Wi-Fi" for the link types present. */
export function summarizeLinks(devices: Device[]): string {
  const present = LINK_ORDER.filter((type) => devices.some((d) => d.linkType === type)).map(
    (type) => LINK_PHRASE[type],
  );
  if (present.length <= 1) return present[0] ?? '';
  return `${present.slice(0, -1).join(', ')} and ${present[present.length - 1]}`;
}

/**
 * A name for a transfer, which the protocol does not carry: the folder it
 * came from when every file shares one top-level folder, the file name when
 * there is only one file, otherwise a count.
 */
export function transferTitle(t: TransferSnapshot): string {
  if (t.files.length === 0) {
    if (t.status === 'scanning') return 'Preparing files…';
    return `${t.fileCount.toLocaleString()} file${t.fileCount === 1 ? '' : 's'}`;
  }
  const tops = new Set(t.files.map((f) => f.item.relPath.split('/')[0]));
  const onlyTop = tops.size === 1 ? Array.from(tops)[0] : null;
  if (t.files.length === 1) return t.files[0].item.relPath.split('/').pop() ?? t.files[0].item.relPath;
  if (onlyTop && t.files.every((f) => f.item.relPath.includes('/'))) return onlyTop;
  return `${t.files.length.toLocaleString()} files`;
}
