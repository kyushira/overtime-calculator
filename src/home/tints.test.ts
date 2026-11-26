import { describe, expect, it } from 'vitest';
import { HOME_MODULES } from './modules';
import { TILE_TINTS, tileTint } from './tints';

const HUE_FILLS = ['bg-tile-blue', 'bg-tile-mint', 'bg-tile-lav', 'bg-tile-peach'];

describe('TILE_TINTS', () => {
  it('has an entry for every HOME_MODULES id', () => {
    for (const m of HOME_MODULES) {
      expect(TILE_TINTS[m.id], `missing tint for ${m.id}`).toBeDefined();
    }
  });

  it('uses only the four bg-tile-* fills', () => {
    for (const t of Object.values(TILE_TINTS)) {
      expect(HUE_FILLS).toContain(t.fill);
    }
  });

  it('uses all four hues', () => {
    const used = new Set(Object.values(TILE_TINTS).map((t) => t.fill));
    expect([...used].sort()).toEqual([...HUE_FILLS].sort());
  });
});

describe('tileTint', () => {
  it('returns the mapped tint for a known id', () => {
    expect(tileTint('pay')).toEqual(TILE_TINTS.pay);
  });

  it('falls back to blue for an unknown id', () => {
    expect(tileTint('nope')).toEqual(TILE_TINTS.car);
  });
});
