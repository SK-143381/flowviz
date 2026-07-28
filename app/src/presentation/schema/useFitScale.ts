import { useEffect, useState } from 'react';

/**
 * Computes the CSS transform scale that fits (contentWidth, contentHeight) inside the
 * given container element without vertical scrolling — the "fits on screen, no scroll to
 * the bottom" requirement for the schema diagram. Never upscales past 1 (tables stay
 * readable when there's few of them); clamps to a floor so text never goes fully illegible,
 * in which case the caller should allow horizontal scroll as the fallback instead of
 * shrinking further.
 */
export function useFitScale(
  containerRef: React.RefObject<HTMLElement | null>,
  contentWidth: number,
  contentHeight: number,
  minScale = 0.4
): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || contentWidth === 0 || contentHeight === 0) {
      setScale(1);
      return;
    }

    const recompute = () => {
      const { clientWidth, clientHeight } = el;
      if (clientWidth === 0 || clientHeight === 0) return;
      const next = Math.min(1, clientWidth / contentWidth, clientHeight / contentHeight);
      setScale(Math.max(minScale, next));
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef, contentWidth, contentHeight, minScale]);

  return scale;
}
