import { useEffect, useRef, useState } from 'react';

export interface Size {
  width: number;
  height: number;
}

/**
 * Tracks an element's real pixel size. The map needs this to draw itself at
 * 1 unit = 1 pixel instead of stretching a fixed-size drawing to fit.
 */
export function useElementSize<T extends HTMLElement>(): [React.RefObject<T>, Size] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setSize((prev) =>
        Math.round(prev.width) === Math.round(box.width) && Math.round(prev.height) === Math.round(box.height)
          ? prev
          : { width: box.width, height: box.height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}
