import { describe, it, expect } from 'vitest';
import { nextAvailableName } from '../../src/core/transfer/logic/conflict-name';

function splitExt(p: string) {
  const lastSlash = p.lastIndexOf('/');
  const dir = p.slice(0, lastSlash);
  const fileName = p.slice(lastSlash + 1);
  const dotInFile = fileName.lastIndexOf('.');
  const ext = dotInFile > 0 ? fileName.slice(dotInFile) : '';
  const base = dotInFile > 0 ? fileName.slice(0, dotInFile) : fileName;
  return { base, ext, dir, sep: '/' };
}

describe('nextAvailableName', () => {
  it('returns the desired path when nothing exists', () => {
    const result = nextAvailableName('/dl/photo.jpg', () => false, splitExt);
    expect(result).toBe('/dl/photo.jpg');
  });

  it('appends (1) when the file exists', () => {
    const existing = new Set(['/dl/photo.jpg']);
    const result = nextAvailableName('/dl/photo.jpg', (p) => existing.has(p), splitExt);
    expect(result).toBe('/dl/photo (1).jpg');
  });

  it('increments past multiple collisions', () => {
    const existing = new Set(['/dl/photo.jpg', '/dl/photo (1).jpg', '/dl/photo (2).jpg']);
    const result = nextAvailableName('/dl/photo.jpg', (p) => existing.has(p), splitExt);
    expect(result).toBe('/dl/photo (3).jpg');
  });

  it('handles files with no extension', () => {
    const existing = new Set(['/dl/README']);
    const result = nextAvailableName('/dl/README', (p) => existing.has(p), splitExt);
    expect(result).toBe('/dl/README (1)');
  });
});
