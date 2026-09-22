import { describe, it, expect } from 'vitest';
import { formatBytes, formatSpeed, formatEta, summarizeLinks, transferTitle } from '../../src/renderer/lib/format';
import { pushSample, peakOf, THROUGHPUT_WINDOW } from '../../src/renderer/lib/throughput';
import type { Device, TransferSnapshot } from '../../src/shared/types';

describe('formatBytes', () => {
  it('scales to the largest sensible unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(24_000)).toBe('24 KB');
    expect(formatBytes(5_200_000)).toBe('5.2 MB');
    expect(formatBytes(8_200_000_000)).toBe('8.2 GB');
  });
  it('never renders NaN or a negative size', () => {
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
  });
});

describe('formatSpeed', () => {
  it('shows one decimal in MB/s', () => {
    expect(formatSpeed(112_400_000)).toBe('112.4 MB/s');
    expect(formatSpeed(0)).toBe('0.0 MB/s');
  });
});

describe('formatEta', () => {
  it('picks a readable unit and returns null when unknown', () => {
    expect(formatEta(undefined)).toBeNull();
    expect(formatEta(0)).toBeNull();
    expect(formatEta(42)).toBe('42 s left');
    expect(formatEta(95)).toBe('2 min left');
    expect(formatEta(7200)).toBe('2.0 h left');
  });
});

describe('summarizeLinks', () => {
  const device = (linkType: Device['linkType']): Device => ({
    id: linkType, name: linkType, os: 'linux', fingerprint: '', shortId: '', addresses: [],
    linkType, trusted: false, lastSeen: 0, port: 0,
  });
  it('names the link types present, in link order', () => {
    expect(summarizeLinks([device('wireless'), device('direct'), device('wired')])).toBe(
      'direct cable, Ethernet and Wi-Fi',
    );
    expect(summarizeLinks([device('wired'), device('wired')])).toBe('Ethernet');
    expect(summarizeLinks([])).toBe('');
  });
});

describe('throughput history', () => {
  it('keeps a bounded rolling window of samples', () => {
    let history: { sent: number; received: number }[] = [];
    for (let i = 0; i < THROUGHPUT_WINDOW + 25; i++) history = pushSample(history, { sent: i, received: 0 });
    expect(history).toHaveLength(THROUGHPUT_WINDOW);
    expect(history[history.length - 1].sent).toBe(THROUGHPUT_WINDOW + 24);
  });
  it('does not mutate the previous history', () => {
    const before = [{ sent: 1, received: 1 }];
    const after = pushSample(before, { sent: 2, received: 2 });
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(2);
  });
  it('reports the peak across both directions', () => {
    expect(peakOf([{ sent: 3, received: 9 }, { sent: 7, received: 1 }])).toBe(9);
    expect(peakOf([])).toBe(0);
  });
});


describe('transferTitle', () => {
  const snap = (paths: string[], over: Partial<TransferSnapshot> = {}): TransferSnapshot => ({
    id: 't', direction: 'send', deviceId: 'd', deviceName: 'Peer', status: 'active',
    totalBytes: 0, bytesDone: 0, fileCount: paths.length, speedBps: 0, createdAt: 0, updatedAt: 0,
    files: paths.map((relPath, index) => ({
      item: { index, relPath, kind: 'file', size: 1, mtimeMs: 0 }, status: 'queued', bytesDone: 0,
    })),
    ...over,
  });

  it('names a folder transfer after the folder', () => {
    expect(transferTitle(snap(['holiday-2024/a.jpg', 'holiday-2024/sub/b.jpg']))).toBe('holiday-2024');
  });
  it('names a single file after the file', () => {
    expect(transferTitle(snap(['report-final.pdf']))).toBe('report-final.pdf');
  });
  it('falls back to a count for loose files', () => {
    expect(transferTitle(snap(['a.txt', 'b.txt', 'c.txt']))).toBe('3 files');
  });
  it('describes a transfer that is still being scanned', () => {
    expect(transferTitle(snap([], { status: 'scanning', fileCount: 0 }))).toBe('Preparing files…');
  });
  it('uses the count when the per-file list is not loaded', () => {
    expect(transferTitle(snap([], { fileCount: 12 }))).toBe('12 files');
  });
});
