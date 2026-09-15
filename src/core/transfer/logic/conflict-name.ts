/** Compute a non-colliding filename: "name.ext" -> "name (1).ext" -> ... */
export function nextAvailableName(
  desiredPath: string,
  exists: (p: string) => boolean,
  splitExt: (p: string) => { base: string; ext: string; dir: string; sep: string },
): string {
  if (!exists(desiredPath)) return desiredPath;
  const { base, ext, dir, sep } = splitExt(desiredPath);
  let n = 1;
  for (;;) {
    const candidate = `${dir}${sep}${base} (${n})${ext}`;
    if (!exists(candidate)) return candidate;
    n += 1;
  }
}
