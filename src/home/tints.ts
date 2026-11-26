/**
 * Icon tile tints for the Home module list. Each hue is defined once and reused
 * by the modules that share it. Tailwind only sees the full literal class strings
 * below, so every class name here must stay spelled out in full.
 */

export interface TileTint {
  /** Background of the 52px icon tile (flips in dark via :root.dark .bg-tile-*). */
  fill: string;
  /** Glow shadow, applied to active rows only. Off in light mode, set in dark. */
  glow: string;
}

const BLUE: TileTint = { fill: 'bg-tile-blue', glow: 'shadow-[var(--shadow-glow-blue)]' };
const MINT: TileTint = { fill: 'bg-tile-mint', glow: 'shadow-[var(--shadow-glow-mint)]' };
const LAV: TileTint = { fill: 'bg-tile-lav', glow: 'shadow-[var(--shadow-glow-lav)]' };
const PEACH: TileTint = { fill: 'bg-tile-peach', glow: 'shadow-[var(--shadow-glow-peach)]' };

/** Keyed by module id (see modules.ts). */
export const TILE_TINTS: Record<string, TileTint> = {
  pay: MINT,
  car: BLUE,
  tax: LAV,
  savings: MINT,
  loans: BLUE,
  sinking: LAV,
  'credit-card': PEACH,
  subscriptions: BLUE,
  health: PEACH,
  receipts: LAV,
};

/** Tint for a module id; falls back to blue for an unknown id. */
export function tileTint(id: string): TileTint {
  return TILE_TINTS[id] ?? BLUE;
}
