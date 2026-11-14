import { useEffect, useState, type CSSProperties } from 'react';
import { prefersReducedMotion, useTween } from '../hooks/useMotion';
import type { PayResult } from '../types/payroll';
import { money } from '../utils/format';

interface Tile {
  key: string;
  label: string;
  value: number;
  negative?: boolean;
  sub: string;
  /** Sub-line contains a money figure (masked when hidden). */
  subMoney?: boolean;
  fill: string;
  /** Dark-theme glow for the tile (no-op in light). */
  glow: string;
  hero?: boolean;
}

const MASK = '$ ••••';

/** Value with a crossfade / blur to a mask when pay figures are hidden. */
function TileValue({ value, negative, hidden, hero }: { value: number; negative?: boolean; hidden: boolean; hero?: boolean }) {
  const v = useTween(value, hero ? 600 : 400);
  // After the fade-out, drop the real figure from the DOM so it can't be read or copied.
  const [gone, setGone] = useState(hidden);
  useEffect(() => {
    if (!hidden) return setGone(false);
    const t = window.setTimeout(() => setGone(true), prefersReducedMotion() ? 0 : 220);
    return () => window.clearTimeout(t);
  }, [hidden]);
  // Sizes keep "S$ 12,345.67" inside a half-width tile at 390px (2×2 grid).
  return (
    <div
      className={`grid tabular-nums tracking-[-0.02em] text-slate-900 ${hero ? 'text-[22px] font-extrabold sm:text-2xl lg:text-xl' : 'text-[15px] font-bold sm:text-2xl lg:text-xl'}`}
      role="img"
      aria-label={hidden ? 'hidden' : `${negative ? 'minus ' : ''}${money(value)}`}
    >
      <span aria-hidden className={`col-start-1 row-start-1 truncate transition-[opacity,filter] duration-200 ease-out ${hidden ? 'opacity-0 blur-sm' : 'opacity-100 blur-0'}`}>
        {gone ? MASK : negative ? `−${money(v)}` : money(v)}
      </span>
      <span aria-hidden className={`col-start-1 row-start-1 truncate text-slate-400 transition-opacity duration-200 ease-out ${hidden ? 'opacity-100' : 'opacity-0'}`}>
        {MASK}
      </span>
    </div>
  );
}

/**
 * Headline KPI tiles, pinned at the top of every tab. Tinted fills, no border:
 * gross blue, CPF lavender, other deductions peach, net (hero) mint.
 * 2×2 on phones and tablets, 4 across on desktop. When `compact` (page scrolled),
 * collapses to one slim row: payout period, net and (wider screens) gross.
 */
export function SummaryCards({ result, hidden, compact = false, periodLabel }: {
  result: PayResult;
  hidden: boolean;
  compact?: boolean;
  /** "November 2026", or null when the payout month isn't valid. */
  periodLabel: string | null;
}) {
  const otherDeductions = result.otherDeductions.reduce((s, d) => s + d.amount, 0);
  const ot = result.earnings.filter((e) => e.key.startsWith('ot-')).reduce((s, e) => s + e.amount, 0);

  if (compact) {
    return (
      <div className="anim-slide-in flex min-w-0 items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[13px] font-semibold text-slate-900">{periodLabel ?? 'Pay period'}</span>
        <dl className="flex shrink-0 items-baseline gap-3 tabular-nums">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-[11px] font-medium text-slate-500">Net</dt>
            <dd className="text-sm font-bold text-slate-900">{hidden ? MASK : money(result.net)}</dd>
          </div>
          <div className="hidden items-baseline gap-1.5 sm:flex">
            <dt className="text-[11px] font-medium text-slate-500">Gross</dt>
            <dd className="text-sm font-semibold text-slate-700">{hidden ? MASK : money(result.gross)}</dd>
          </div>
        </dl>
      </div>
    );
  }

  const tiles: Tile[] = [
    { key: 'gross', label: 'Gross pay', value: result.gross, sub: `OT ${money(ot)}`, subMoney: true, fill: 'bg-tile-blue', glow: 'shadow-[var(--shadow-glow-blue)]' },
    { key: 'cpf', label: `CPF ${+(result.cpfRate * 100).toFixed(2)}%`, value: result.cpf, negative: true, sub: 'of gross, rounded down', fill: 'bg-tile-lav', glow: 'shadow-[var(--shadow-glow-lav)]' },
    { key: 'other', label: 'Other deductions', value: otherDeductions, negative: true, sub: `${result.otherDeductions.length} item(s)`, fill: 'bg-tile-peach', glow: 'shadow-[var(--shadow-glow-peach)]' },
    { key: 'net', label: 'Net pay', value: result.net, sub: 'take-home', fill: 'bg-tile-mint', glow: 'shadow-[var(--shadow-glow-mint)]', hero: true },
  ];

  return (
    <div>
      <p className="mb-2 text-[13px] text-slate-500">
        Payout <span className="font-semibold text-slate-900">{periodLabel ?? 'pick a valid month'}</span>
      </p>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <div
            key={t.key}
            style={{ '--i': i } as CSSProperties}
            className={`anim-fade-up group relative min-w-0 overflow-hidden rounded-xl px-3 py-2 transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] sm:p-4 ${t.fill} ${t.glow} ${t.hero ? 'ring-1 ring-good/25' : ''}`}
          >
            {t.hero && (
              <div aria-hidden className="halftone pointer-events-none absolute right-0 bottom-0 hidden h-full w-28 text-good/20 [mask-image:linear-gradient(to_left,black,transparent)] sm:block lg:w-32" />
            )}
            <div className="relative">
              <div className="truncate text-[11px] font-medium text-slate-500 sm:text-[13px]">{t.label}</div>
              <TileValue value={t.value} negative={t.negative} hidden={hidden} hero={t.hero} />
              <div className="mt-1.5 hidden sm:block">
                <span className="inline-flex items-center rounded-full bg-surface/70 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">{hidden && t.subMoney ? 'OT ••••' : t.sub}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
