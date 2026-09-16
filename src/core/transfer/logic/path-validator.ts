// Windows reserved device names (case-insensitive, with or without extension).
const RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

// eslint-disable-next-line no-control-regex -- deliberately rejecting control characters in filenames
const INVALID_CHARS = /[<>:"|?*\u0000-\u001f]/;

/**
 * Validates a transfer item's relative path against every rule in spec §5.4.
 * Rules apply on every OS, since a transfer can land on any OS.
 */
export function isValidRelPath(relPath: string): boolean {
  if (!relPath || relPath.length === 0) return false;
  if (relPath.startsWith('/') || relPath.startsWith('\\')) return false;
  if (/^[a-zA-Z]:/.test(relPath)) return false; // absolute Windows path like C:\
  if (relPath.includes('\0')) return false;

  const segments = relPath.split(/[\\/]/);
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') return false;
    if (INVALID_CHARS.test(segment)) return false;
    if (segment.endsWith(' ') || segment.endsWith('.')) return false;
    const base = segment.split('.')[0].toUpperCase();
    if (RESERVED_NAMES.has(base)) return false;
  }
  return true;
}

/** Resolve relPath under root and verify it doesn't escape (defense in depth). */
export function resolveWithinRoot(
  root: string,
  relPath: string,
  pathResolve: (...parts: string[]) => string,
  pathSep: string,
): string | null {
  const normalizedRel = relPath.split(/[\\/]/).join(pathSep);
  const resolved = pathResolve(root, normalizedRel);
  const resolvedRoot = pathResolve(root);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + pathSep)) {
    return null;
  }
  return resolved;
}
