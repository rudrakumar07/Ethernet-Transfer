import { describe, it, expect } from 'vitest';
import { planResume } from '../../src/core/transfer/logic/resume-plan';
import type { TransferItem } from '../../src/shared/types';

const fileItem = (over: Partial<TransferItem> = {}): TransferItem => ({
  index: 0,
  relPath: 'a.txt',
  kind: 'file',
  size: 100,
  mtimeMs: 1000,
  ...over,
});

describe('planResume', () => {
  it('resumes unchanged files from the receiver offset', () => {
    const items = [fileItem({ index: 0 })];
    const plan = planResume(items, { 0: 40 }, () => ({ exists: true, size: 100, mtimeMs: 1000 }));
    expect(plan).toEqual([{ kind: 'resume', index: 0, offset: 40 }]);
  });

  it('restarts from zero when the source size changed', () => {
    const items = [fileItem({ index: 0, size: 100, mtimeMs: 1000 })];
    const plan = planResume(items, { 0: 40 }, () => ({ exists: true, size: 200, mtimeMs: 1000 }));
    expect(plan).toEqual([{ kind: 'restart', index: 0, size: 200, mtimeMs: 1000 }]);
  });

  it('restarts from zero when the source mtime changed', () => {
    const items = [fileItem({ index: 0, size: 100, mtimeMs: 1000 })];
    const plan = planResume(items, { 0: 40 }, () => ({ exists: true, size: 100, mtimeMs: 2000 }));
    expect(plan).toEqual([{ kind: 'restart', index: 0, size: 100, mtimeMs: 2000 }]);
  });

  it('reports missing when the source file is gone', () => {
    const items = [fileItem({ index: 0 })];
    const plan = planResume(items, {}, () => ({ exists: false, size: 0, mtimeMs: 0 }));
    expect(plan).toEqual([{ kind: 'missing', index: 0 }]);
  });

  it('defaults offset to zero when the receiver reports none', () => {
    const items = [fileItem({ index: 0 })];
    const plan = planResume(items, {}, () => ({ exists: true, size: 100, mtimeMs: 1000 }));
    expect(plan).toEqual([{ kind: 'resume', index: 0, offset: 0 }]);
  });

  it('ignores directory items', () => {
    const items = [fileItem({ index: 0, kind: 'dir' })];
    const plan = planResume(items, {}, () => ({ exists: true, size: 0, mtimeMs: 0 }));
    expect(plan).toEqual([]);
  });
});
