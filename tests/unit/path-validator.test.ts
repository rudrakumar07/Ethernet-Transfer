import { describe, it, expect } from 'vitest';
import { isValidRelPath, resolveWithinRoot } from '../../src/core/transfer/logic/path-validator';
import path from 'node:path';

describe('isValidRelPath', () => {
  it.each([
    'photo.jpg',
    'folder/photo.jpg',
    'a/b/c/d.txt',
    'no-extension',
    '.hidden-but-not-dotdot',
  ])('accepts valid path %s', (p) => {
    expect(isValidRelPath(p)).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['../escape.txt', 'parent traversal'],
    ['a/../../escape.txt', 'nested parent traversal'],
    ['/absolute/path.txt', 'absolute unix path'],
    ['C:\\Windows\\System32\\evil.dll', 'absolute windows path'],
    ['a/b/', 'trailing slash empty segment'],
    ['CON', 'reserved name'],
    ['CON.txt', 'reserved name with extension'],
    ['com1.log', 'reserved name case-insensitive'],
    ['bad<name>.txt', 'invalid character <'],
    ['bad|name.txt', 'invalid character |'],
    ['trailing.dot.', 'segment ending in dot'],
    ['a/\0b', 'null byte'],
  ])('rejects invalid path %s (%s)', (p) => {
    expect(isValidRelPath(p)).toBe(false);
  });

  it('rejects a segment that itself ends with a space', () => {
    expect(isValidRelPath('bad name /file.txt')).toBe(false);
  });

  it('rejects a segment ending in a dot', () => {
    expect(isValidRelPath('folder./file.txt')).toBe(false);
  });
});

describe('resolveWithinRoot', () => {
  it('resolves a normal relative path under the root', () => {
    const result = resolveWithinRoot('/root', 'a/b.txt', path.posix.resolve, path.posix.sep);
    expect(result).toBe('/root/a/b.txt');
  });

  it('rejects a path that escapes the root via traversal made it past isValidRelPath', () => {
    // Defense in depth: even if a caller skipped isValidRelPath, resolveWithinRoot rejects escape.
    const result = resolveWithinRoot('/root', '../escape.txt', path.posix.resolve, path.posix.sep);
    expect(result).toBeNull();
  });
});
