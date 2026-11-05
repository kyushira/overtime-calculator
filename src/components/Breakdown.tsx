import type { CSSProperties } from 'react';
import type { LineItem, PayResult } from '../types/payroll';
import { money, num } from '../utils/format';
import { Card, SectionLabel } from './ui';

/** Visual category for an earnings/deduction line (icon tint + chart colour). */
type Cat = 'basic' | 'allowance' | 'weekday' | 'saturday' | 'sunday' | 'ph' | 'deduction';

const CAT: Record<Cat, { label: string; short?: string; tint: string; ring: string; fill: string }> = {
  basic: { label: 'Basic', tint: 'bg-slate-100', ring: 'text-slate-600', fill: '#4b5563' },
  allowance: { label: 'Allowances', short: 'Allow.', tint: 'bg-good-bg', ring: 'text-good', fill: '#22a861' },
  weekday: { label: 'Weekday OT', short: 'Wkday', tint: 'bg-accent-bg', ring: 'text-accent', fill: '#5b4bd6' },
  saturday: { label: 'Saturday', short: 'Sat', tint: 'bg-sat-bg', ring: 'text-sat', fill: '#e39a2d' },
  sunday: { label: 'Sunday', short: 'Sun', tint: 'bg-sun-bg', ring: 'text-sun', fill: '#db2c5a' },
  ph: { label: 'Public holiday', short: 'PH', tint: 'bg-ph-bg', ring: 'text-ph', fill: '#3b82f6' },
  deduction: { label: 'Deduction', tint: 'bg-bad-bg', ring: 'text-bad', fill: '#e5484d' },
};

function catOf(key: string): Cat {
  if (key === 'basic') return 'basic';
  if (key === 'transport' || key === 'shift-allowance') return 'allowance';
  if (key === 'ot-weekday') return 'weekday';
  if (key === 'ot-saturday') return 'saturday';
  if (key === 'ot-sunday') return 'sunday';
  if (key === 'ot-ph') return 'ph';
  return 'deduction';
}

/** Small tinted square with a dotted ring, like the reference table's row icons. */
function RowIcon({ cat }: { cat: Cat }) {
  const c = CAT[cat];
  return (
    <span aria-hidden className={`flex size-6 shrink-0 items-center justify-center rounded-md ${c.tint} ${c.ring}`}>
      <svg viewBox="0 0 16 16" className="size-3.5">
        <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1.6 1.9" strokeLinecap="round" />
        <circle cx="8" cy="8" r="1.6" fill="currentColor" />
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Gross split: dot-matrix columns (halftone style) + legend list      */
/* ------------------------------------------------------------------ */

const DOT_COLS = 4;
const DOT_ROWS = 14;
const PITCH = 7;
const R = 2;

function GrossSplit({ result }: { result: PayResult }) {
  const order: Cat[] = ['basic', 'allowance', 'weekday', 'saturday', 'sunday', 'ph'];
  const sums = new Map<Cat, number>();
  for (const e of result.earnings) sums.set(catOf(e.key), (sums.get(catOf(e.key)) ?? 0) + e.amount);
  // Public holiday only gets a column when there is one.
  const parts = order
    .map((c) => ({ cat: c, amount: Math.round((sums.get(c) ?? 0) * 100) / 100 }))
    .filter((p) => p.cat !== 'ph' || p.amount > 0);
  const max = Math.max(...parts.map((p) => p.amount), 1);
  const gross = result.gross || 1;

  const colW = DOT_COLS * PITCH;
  const gap = 18;
  const width = parts.length * colW + (parts.length - 1) * gap;
  const height = DOT_ROWS * PITCH;

  return (
    <Card title="Where your gross comes from" subtitle={`Formula estimate · ${money(result.gross)}`} index={0}>
      <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <svg
          viewBox={`0 0 ${width} ${height + 16}`}
          className="mx-auto h-auto w-full max-w-[18rem]"
          role="img"
          aria-label={parts.map((p) => `${CAT[p.cat].label} ${money(p.amount)}`).join(', ')}
        >
          {parts.map((p, ci) => {
            const filledRows = p.amount > 0 ? Math.max(1, Math.round((p.amount / max) * DOT_ROWS)) : 0;
            const x0 = ci * (colW + gap);
            const dots = [];
            for (let r = 0; r < DOT_ROWS; r++) {
              for (let c = 0; c < DOT_COLS; c++) {
                const on = r < filledRows;
                dots.push(
                  <circle
                    key={`${r}-${c}`}
                    cx={x0 + c * PITCH + PITCH / 2}
                    cy={height - r * PITCH - PITCH / 2}
                    r={R}
                    fill={on ? CAT[p.cat].fill : '#e2e2e6'}
                    opacity={on ? 0.55 + 0.45 * (r / Math.max(1, filledRows)) : 1}
                  />,
                );
              }
            }
            return (
              <g key={p.cat}>
                <g className="anim-grow-y" style={{ '--i': ci } as CSSProperties}>{dots}</g>
                <text x={x0 + colW / 2} y={height + 13} textAnchor="middle" fontSize="8.5" fill="#9ca3af" fontFamily="inherit">
                  {CAT[p.cat].short ?? CAT[p.cat].label}
                </text>
              </g>
            );
          })}
        </svg>

        <ul className="divide-y divide-slate-100">
          {parts.map((p, i) => (
            <li key={p.cat} className="flex items-center gap-3 py-2 text-sm">
              <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: CAT[p.cat].fill }} />
              <span className="min-w-0 flex-1 truncate text-slate-700">{CAT[p.cat].label}</span>
              <span className="hidden w-24 sm:block">
                <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className="anim-grow-x block h-full rounded-full"
                    style={{ width: `${(p.amount / gross) * 100}%`, background: CAT[p.cat].fill, '--i': i } as CSSProperties}
                  />
                </span>
              </span>
              <span className="w-10 text-right text-xs tabular-nums text-slate-400">{Math.round((p.amount / gross) * 100)}%</span>
              <span className="w-24 text-right font-medium tabular-nums text-slate-900">{money(p.amount)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Line-by-line table                                                  */
/* ------------------------------------------------------------------ */

export function Breakdown({ result }: { result: PayResult }) {
  const Row = ({ item, negative, cat }: { item: LineItem; negative?: boolean; cat: Cat }) => (
    <tr className="border-t border-slate-100 transition-colors duration-150 hover:bg-slate-50">
      <td className="py-2.5 pr-2 pl-3 sm:pl-4">
        <div className="flex items-center gap-2.5">
          <RowIcon cat={cat} />
          <div className="min-w-0">
            <div className="font-medium text-slate-900">{item.label}</div>
            {item.quantity !== undefined && (
              <div className="text-xs text-slate-400">
                {num(item.quantity)} {item.unit} × {money(item.rate ?? 0)}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-slate-900 sm:pr-4">
        {negative ? `−${money(item.amount)}` : money(item.amount)}
      </td>
    </tr>
  );

  const Total = ({ label, value, strong }: { label: string; value: number; strong?: boolean }) => (
    <tr className={`border-t border-slate-200 ${strong ? 'bg-tile-mint' : 'bg-slate-50'}`}>
      <td className="py-2.5 pl-3 font-semibold text-slate-900 sm:pl-4">{label}</td>
      <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-slate-900 sm:pr-4">{money(value)}</td>
    </tr>
  );

  const Group = ({ children }: { children: string }) => (
    <tr className="border-t border-slate-100">
      <td colSpan={2} className="px-3 pt-4 pb-1.5 sm:px-4"><SectionLabel>{children}</SectionLabel></td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <GrossSplit result={result} />

      <Card index={1} title="Full breakdown" subtitle="Hours × hourly rate × multiplier" flush>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.05em] text-slate-500">
                <th className="py-2.5 pl-3 font-medium sm:pl-4">Item</th>
                <th className="py-2.5 pr-3 text-right font-medium sm:pr-4">Amount</th>
              </tr>
            </thead>
            <tbody>
              <Group>Earnings</Group>
              {result.earnings.map((e) => <Row key={e.key} item={e} cat={catOf(e.key)} />)}
              <Total label="Gross pay" value={result.gross} />

              <Group>Deductions</Group>
              <Row cat="deduction" item={{ key: 'cpf', label: `CPF employee (${+(result.cpfRate * 100).toFixed(2)}%)`, amount: result.cpf }} negative />
              {result.otherDeductions.map((d) => <Row key={d.key} cat="deduction" item={d} negative />)}
              <Total label="Total deductions" value={result.totalDeductions} />
              <Total label="Net pay" value={result.net} strong />
            </tbody>
          </table>
        </div>
        <p className="px-4 py-4 text-xs leading-relaxed text-slate-500 sm:px-5">
          Hourly rate = 12 × basic ÷ (52 × weekly hours). Weekday OT = hours × hourly × multiplier. Saturday, Sunday and public holiday =
          full shift hours × hourly × multiplier ({money(result.rates.sundayPerShift)} per Sunday / PH shift). CPF is rounded down to the dollar.
        </p>
      </Card>
    </div>
  );
}
