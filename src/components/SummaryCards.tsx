import { Eye, EyeOff } from 'lucide-react';
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
  return (
    <div
      className={`grid tabular-nums tracking-[-0.02em] text-slate-900 ${hero ? 'text-[28px] font-extrabold' : 'text-[15px] font-bold sm:text-2xl'}`}
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
 * Headline KPI tiles, pinned at the top of every tab. Tinted fills, no
 * border: gross blue, CPF lavender, other deductions peach, net (hero) mint.
 * Compact 2×2 on phones; 4 across with a small context line on wider screens.
 */
export function SummaryCards({ result, hidden, onToggleHidden }: { result: PayResult; hidden: boolean; onToggleHidden: () => void }) {
  const otherDeductions = result.otherDeductions.reduce((s, d) => s + d.amount, 0);
  const ot = result.earnings.filter((e) => e.key.startsWith('ot-')).reduce((s, e) => s + e.amount, 0);

  const tiles: Tile[] = [
    { key: 'gross', label: 'Gross pay', value: result.gross, sub: `OT ${money(ot)}`, subMoney: true, fill: 'bg-tile-blue' },
    { key: 'cpf', label: `CPF ${+(result.cpfRate * 100).toFixed(2)}%`, value: result.cpf, negative: true, sub: 'of gross, rounded down', fill: 'bg-tile-lav' },
    { key: 'other', label: 'Other deductions', value: otherDeductions, negative: true, sub: `${result.otherDeductions.length} item(s)`, fill: 'bg-tile-peach' },
    { key: 'net', label: 'Net pay', value: result.net, sub: 'take-home', fill: 'bg-tile-mint', hero: true },
  ];

  return (
    <div className="relative grid grid-cols-3 gap-1.5 sm:gap-3 lg:grid-cols-4">
      <button
        type="button"
        onClick={onToggleHidden}
        aria-label={hidden ? 'Show pay figures' : 'Hide pay figures'}
        aria-pressed={hidden}
        title={hidden ? 'Show pay figures' : 'Hide pay figures'}
        className="absolute top-1 right-1 z-10 grid size-8 place-items-center rounded-full bg-white/80 text-slate-500 ring-1 ring-slate-200 backdrop-blur transition duration-150 ease-out hover:text-slate-900 active:scale-90 sm:top-2 sm:right-2"
      >
        <Eye size={16} strokeWidth={1.5} aria-hidden className={`col-start-1 row-start-1 transition-[opacity,transform] duration-200 ${hidden ? 'scale-75 opacity-0' : 'opacity-100'}`} />
        <EyeOff size={16} strokeWidth={1.5} aria-hidden className={`col-start-1 row-start-1 transition-[opacity,transform] duration-200 ${hidden ? 'opacity-100' : 'scale-75 opacity-0'}`} />
      </button>
      {tiles.map((t, i) => (
        <div
          key={t.key}
          style={{ '--i': i } as CSSProperties}
          className={`anim-fade-up group relative min-w-0 overflow-hidden rounded-xl px-3 py-2 transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] sm:p-4 ${t.fill} ${t.hero ? 'col-span-3 lg:col-span-1 ring-1 ring-good/25' : ''}`}
        >
          {t.hero && (
            <div aria-hidden className="halftone pointer-events-none absolute right-0 bottom-0 hidden h-full w-28 text-good/20 [mask-image:linear-gradient(to_left,black,transparent)] sm:block lg:w-32" />
          )}
          <div className="relative">
            {/* Leave room for the eye button: top-right tile is CPF on phones (2×2), Net on desktop (4 across). */}
            <div className={`truncate text-[11px] font-medium text-slate-500 sm:text-[13px] ${i === 2 ? 'max-lg:pr-8' : ''} ${i === 3 ? 'lg:pr-9' : ''}`}>{t.label}</div>
            <TileValue value={t.value} negative={t.negative} hidden={hidden} hero={t.hero} />
            <div className="mt-1.5 hidden sm:block">
              <span className="inline-flex items-center rounded-full bg-white/70 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">{hidden && t.subMoney ? 'OT ••••' : t.sub}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
