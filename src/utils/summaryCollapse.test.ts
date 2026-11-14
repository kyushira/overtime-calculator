import { describe, expect, it } from 'vitest';
import { COLLAPSE_AT, EXPAND_AT, nextCollapsed } from './summaryCollapse';

describe('nextCollapsed', () => {
  it('collapses once scrolled past the collapse threshold', () => {
    expect(nextCollapsed(false, COLLAPSE_AT + 1, COLLAPSE_AT, EXPAND_AT)).toBe(true);
    expect(nextCollapsed(false, 2000)).toBe(true);
  });

  it('expands again near the top', () => {
    expect(nextCollapsed(true, 0)).toBe(false);
    expect(nextCollapsed(true, EXPAND_AT - 1)).toBe(false);
  });

  it('keeps the previous state inside the band (no flicker)', () => {
    const mid = (COLLAPSE_AT + EXPAND_AT) / 2;
    expect(nextCollapsed(true, mid)).toBe(true);
    expect(nextCollapsed(false, mid)).toBe(false);
    expect(nextCollapsed(false, COLLAPSE_AT)).toBe(false); // exactly at threshold: not yet
  });

  it('ignores non-finite scroll values', () => {
    expect(nextCollapsed(true, Number.NaN)).toBe(true);
    expect(nextCollapsed(false, Number.POSITIVE_INFINITY)).toBe(false);
  });
});
