/**
 * Collapse state for the sticky KPI bar. Pure, so the thresholds can be tested.
 * Two thresholds (hysteresis) stop the bar flickering when scrolling near the edge.
 */

/** Scrolled past this (px) → collapse to the single slim row. */
export const COLLAPSE_AT = 140;
/** Back near the top (px, below this) → expand again. */
export const EXPAND_AT = 60;

export function nextCollapsed(
  prev: boolean,
  scrollY: number,
  collapseAt: number = COLLAPSE_AT,
  expandAt: number = EXPAND_AT,
): boolean {
  if (!Number.isFinite(scrollY)) return prev;
  if (scrollY > collapseAt) return true;
  if (scrollY < expandAt) return false;
  return prev;
}
