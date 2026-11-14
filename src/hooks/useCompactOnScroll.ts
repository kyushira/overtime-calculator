import { useEffect, useState } from 'react';
import { nextCollapsed } from '../utils/summaryCollapse';

/**
 * True when the page is scrolled far enough that the sticky KPI bar should
 * collapse to its slim row. Passive listener; setState bails out when the
 * value is unchanged, so scrolling doesn't re-render on every frame.
 * Reduced motion needs no handling here: the row swap is instant and the
 * global reduced-motion CSS already suppresses its entrance animation.
 */
export function useCompactOnScroll(): boolean {
  const [compact, setCompact] = useState(() => (typeof window === 'undefined' ? false : nextCollapsed(false, window.scrollY)));

  useEffect(() => {
    const onScroll = () => setCompact((c) => nextCollapsed(c, window.scrollY));
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return compact;
}
