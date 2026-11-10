import type { CarResult } from '../utils/car';
import { formatTenure, RUNNING_COSTS } from '../utils/car';
import { money } from '../utils/format';
import { Card } from './ui';

/** Segment colours for the monthly breakdown (instalment uses the app accent). */
const RUNNING_COLORS: Record<string, string> = {
  insurance: '#ff9f0a',
  roadtax: '#30b0c7',
  service: '#af52de',
  parking: '#ff2d55',
  petrol: '#34c759',
  erp: '#a2845e',
};
const INSTALMENT_COLOR = '#5b4bd6';

const BAND = {
  ok: { bar: 'bg-good', text: 'text-good' },
  warn: { bar: 'bg-sat', text: 'text-sat' },
  bad: { bar: 'bg-bad', text: 'text-bad' },
} as const;

function Tile({ label, value, sub, emphasis = false }: { label: string; value: string; sub?: string; emphasis?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[var(--shadow-card)] sm:p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 truncate text-[15px] font-bold tabular-nums tracking-[-0.01em] sm:text-xl ${emphasis ? 'text-accent' : 'text-slate-900'}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

/** Donut of the monthly total: instalment plus each running cost. */
function Donut({ result }: { result: CarResult }) {
  const parts = [
    { id: 'instalment', label: 'Loan instalment', value: result.instalment, color: INSTALMENT_COLOR },
    ...RUNNING_COSTS.map((r) => ({
      id: r.id,
      label: r.label,
      value: result.runningItems.find((i) => i.id === r.id)!.monthly,
      color: RUNNING_COLORS[r.id],
    })),
  ];
  const total = result.totalMonthly;
  const R = 15.9155; // circumference = 100 → dash length is a percentage
  let offset = 25;
  const arcs = parts.map((p) => {
    const pct = total > 0 ? (p.value / total) * 100 : 0;
    const arc = { ...p, pct, offset };
    offset -= pct;
    return arc;
  });

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 42 42" role="img" aria-label="Monthly cost breakdown" className="mx-auto size-40 shrink-0 text-slate-900">
        <circle cx="21" cy="21" r={R} fill="none" stroke="#f6f6f7" strokeWidth="5" />
        {arcs.map((a) =>
          a.pct > 0 ? (
            <circle
              key={a.id}
              cx="21"
              cy="21"
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth="5"
              strokeDasharray={`${a.pct} ${100 - a.pct}`}
              strokeDashoffset={a.offset}
            />
          ) : null,
        )}
        <text x="21" y="21.5" textAnchor="middle" fontSize="4.6" fontWeight="700" fill="currentColor">
          {money(Math.round(total)).replace('.00', '')}
        </text>
        <text x="21" y="26" textAnchor="middle" fontSize="2.6" fill="currentColor" opacity=".6">
          per month
        </text>
      </svg>
      <ul className="min-w-0 flex-1 basis-48 space-y-1 text-[13px]">
        {arcs.map((a) => (
          <li key={a.id} className="flex min-w-0 items-center gap-2 py-0.5">
            <i className="size-2.5 shrink-0 rounded-[3px]" style={{ background: a.color }} aria-hidden />
            <span className="min-w-0 truncate text-slate-600">
              {a.label} · {(total > 0 ? (a.value / total) * 100 : 0).toFixed(0)}%
            </span>
            <b className="ml-auto whitespace-nowrap pl-2 font-semibold tabular-nums text-slate-900">{money(a.value)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Dashboard for the car calculator: hero total, KPI tiles, breakdown, affordability. */
export function CarResults({ result }: { result: CarResult }) {
  const aff = result.affordability;
  const band = aff ? BAND[aff.band] : null;
  const tenureLabel = formatTenure(result.tenure.months);

  return (
    <div className="min-w-0 space-y-4">
      <section className="rounded-xl bg-ink p-5 text-white sm:p-6" aria-live="polite">
        <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-white/70">Total monthly car cost</div>
        <div className="mt-1 text-[34px] font-bold leading-tight tracking-[-0.02em] tabular-nums sm:text-[40px]">
          {money(result.totalMonthly)}
        </div>
        <div className="mt-1.5 text-[13px] text-white/75">
          {money(result.instalment)} instalment + {money(result.running)} running costs
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Tile label="Monthly instalment" value={money(result.instalment)} emphasis />
        <Tile label="Running costs / mth" value={money(result.running)} emphasis />
        <Tile label="Loan amount" value={money(result.loan)} />
        <Tile label="Downpayment" value={money(result.down)} sub={`${result.downSharePct}% of price`} />
        <Tile label="Total interest" value={money(result.interest)} />
        <Tile label="Total repayable" value={money(result.repayable)} />
        <Tile label="EIR (approx.)" value={`≈ ${result.eir.toFixed(2)}%`} sub="≈ flat × 2n/(n+1)" />
        <Tile label="Total cost of ownership" value={money(result.tco)} sub={`over ${result.tenure.months} months (${tenureLabel})`} />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Card title="Monthly breakdown">
          <Donut result={result} />
        </Card>

        <Card title="Affordability" subtitle="Share of your monthly salary the car takes.">
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0 rounded-lg bg-slate-100 px-3 py-2.5">
              <div className="text-xs text-slate-500">Minimum salary <span className="text-slate-400">(cost ≤ 70%)</span></div>
              <div className="mt-0.5 truncate text-[15px] font-bold tabular-nums">{money(result.minSalary)}</div>
              <div className="truncate text-[11px] text-slate-500">{money(result.minSalary * 12)} / year</div>
            </div>
            <div className="min-w-0 rounded-lg bg-slate-100 px-3 py-2.5">
              <div className="text-xs text-slate-500">Recommended salary <span className="text-slate-400">(cost ≤ 30%)</span></div>
              <div className="mt-0.5 truncate text-[15px] font-bold tabular-nums">{money(result.recSalary)}</div>
              <div className="truncate text-[11px] text-slate-500">{money(result.recSalary * 12)} / year</div>
            </div>
          </div>

          {aff && band ? (
            <div className="mt-4 space-y-2">
              <div
                role="progressbar"
                aria-label="Share of salary"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(aff.pct)}
                className="h-2 overflow-hidden rounded-full bg-slate-100"
              >
                <div className={`h-full rounded-full transition-[width] duration-300 ${band.bar}`} style={{ width: `${Math.min(100, aff.pct)}%` }} />
              </div>
              <p className="text-[15px]">
                <span className={`font-bold ${band.text}`}>{aff.verdict}</span>
                <span className="text-slate-500"> · {aff.pct.toFixed(1)}% of your monthly salary</span>
              </p>
            </div>
          ) : (
            <p className="mt-4 text-[13px] text-slate-500">Enter your monthly salary (or use your OT net pay) to see how comfortable this is.</p>
          )}
        </Card>
      </div>

      <details className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-600 shadow-[var(--shadow-card)] sm:p-5">
        <summary className="cursor-pointer font-semibold text-accent">Formulas used</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li><b>MAS loan cap:</b> OMV ≤ S$20,000 → max loan 70% (min 30% down); OMV &gt; S$20,000 or blank → max loan 60% (min 40% down).</li>
          <li><b>Downpayment:</b> <code>S$ = Price × % ÷ 100</code>, <code>% = S$ ÷ Price × 100</code>; changing price keeps the %.</li>
          <li><b>Loan</b> = <code>Car Price − Downpayment</code></li>
          <li><b>Tenure:</b> <code>n = Years × 12 + Months</code> (1–84); years in formula = <code>n ÷ 12</code></li>
          <li><b>Total Interest</b> = <code>Loan × (Rate ÷ 100) × (n ÷ 12)</code></li>
          <li><b>Monthly Instalment</b> = <code>(Loan + Total Interest) ÷ n</code></li>
          <li><b>EIR (approx.)</b> ≈ <code>Flat Rate × 2 × n ÷ (n + 1)</code></li>
          <li><b>Running costs / month</b> = <code>yearly items ÷ 12 + monthly items</code></li>
          <li><b>Total Monthly Car Cost</b> = <code>Instalment + Running Costs</code></li>
          <li><b>Total Cost of Ownership</b> = <code>Downpayment + Total Repayable + Running Costs × n</code></li>
          <li><b>Minimum salary</b> = <code>Monthly Cost ÷ 0.70</code>; <b>Recommended</b> = <code>Monthly Cost ÷ 0.30</code>; annual = ×12</li>
          <li><b>Bar:</b> ≤ 30% Comfortable · 30–70% Stretching · &gt; 70% Not affordable</li>
        </ul>
      </details>
      <p className="pt-2 text-center text-xs text-slate-400">Estimates only. Rates, MAS rules and costs change; check with your bank or dealer.</p>
    </div>
  );
}
