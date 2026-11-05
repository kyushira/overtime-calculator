import { useEffect, useRef, useState } from 'react';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Tween a number towards `value` (count-up on mount, then smooth changes).
 * Display-only: callers still use the exact value for anything that matters,
 * and the final frame always lands exactly on `value`.
 */
export function useTween(value: number, duration = 300): number {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  const from = useRef(shown);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (prefersReducedMotion() || !Number.isFinite(value)) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = t >= 1 ? value : a + (value - a) * easeOutCubic(t);
      from.current = v;
      setShown(v);
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current !== undefined) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  return shown;
}

/** Quick scale "pop" on an element (Web Animations API); no-op for reduced motion. */
export function pop(el: Element | null) {
  if (!el || prefersReducedMotion() || typeof (el as HTMLElement).animate !== 'function') return;
  (el as HTMLElement).animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(0.86)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }],
    { duration: 240, easing: 'ease-out' },
  );
}
