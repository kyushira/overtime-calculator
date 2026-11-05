import { ArrowRight, CircleCheck } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import type { OtQuantities, PayCycle, PayrollConfig, TargetResult } from '../types/payroll';
import { money, num } from '../utils/format';
import { findMinimumCombo, targetBase } from '../utils/payroll';
import { parseNonNegative } from '../utils/validation';
import { Badge, btnPrimary, Card, ErrorText, Field, NumInput, SectionLabel } from './ui';

interface Props {
  targetNet: string;
  onTargetChange: (v: string) => void;
  cycle: PayCycle | null;
  config: PayrollConfig;
  onApply: (q: OtQuantities) => void;
}

/**
 * Progress-to-target bar: base net (no OT) + what the OT combo adds,
 * with a marker at the target. Both segments grow in from 0.
 */
function TargetProgress({ target, outcome }: { target: number; outcome: TargetResult }) {
  const reached = outcome.result.net;
  const base = Math.min(outcome.baseNet, reached);
  const max = Math.max(target, reached, outcome.baseNet, 1) * 1.04;
  const pct = (v: number) => `${Math.max(0, (v / max) * 100)}%`;
  const share = Math.round((reached / Math.max(target, 1)) * 100);

  return (
    <div className="rounded-xl bg-slate-100/70 p-4">
      <div className="mb-2 flex items-end justify-between gap-2">
        <div>
          <SectionLabel>Progress to target</SectionLabel>
          <div className="mt-0.5 text-2xl font-bold tabular-nums tracking-[-0.02em] text-slate-900">{share}%</div>
        </div>
        <div className="text-right text-xs text-slate-500">
          {money(reached)} <span className="text-slate-400">of</span> {money(target)}
        </div>
      </div>
      <div className="relative py-1" role="img" aria-label={`Base net (no OT) ${money(outcome.baseNet)}, with OT ${money(reached)}, target ${money(target)}`}>
        <div className="relative h-3 overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
          <span className="anim-grow-x absolute inset-y-0 left-0 rounded-full bg-slate-800" style={{ width: pct(base), '--i': 0 } as CSSProperties} />
          <span className="anim-grow-x absolute inset-y-0 rounded-r-full bg-accent" style={{ left: pct(base), width: pct(reached - base), '--i': 3 } as CSSProperties} />
        </div>
        <span aria-hidden className="absolute inset-y-0 w-[3px] -translate-x-1/2 rounded-full bg-good ring-2 ring-white" style={{ left: pct(target) }} />
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <li className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-slate-800" /> Base net (no OT) {money(outcome.baseNet)}</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-accent" /> OT adds {money(Math.max(0, reached - outcome.baseNet))}</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-0.5 rounded-full bg-good" /> Target {money(target)}</li>
      </ul>
    </div>
  );
}

/**
 * Reverse calculator: minimum OT combo (Sundays → Saturdays → weekday OT) to hit a target net,
 * from a FIXED base (see targetBase). Public holidays never count.
 */
export function TargetMode({ targetNet, onTargetChange, cycle, config, onApply }: Props) {
  const parsed = parseNonNegative(targetNet, 'Target net pay', { max: 100000 });

  const outcome = useMemo(() => {
    if (!cycle || parsed.error || targetNet.trim() === '') return null;
    // Caps come from the calendar: can't work more Sundays than the OT cycle contains.
    const limits = {
      maxSundays: cycle.sundays,
      maxSaturdays: cycle.saturdays,
      maxWeekdayOtHours: cycle.weekdays * config.rules.weekdayOtHoursPerDay,
      weekdayStep: config.rules.weekdayOtHoursPerDay,
    };
    // Fixed base from Settings; ignores the Calculator tab and the calendar.
    return findMinimumCombo(parsed.value, targetBase(config), config, limits);
  }, [cycle, parsed.value, parsed.error, targetNet, config]);

  const ComboTiles = ({ q }: { q: OtQuantities }) => (
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: 'Sundays', v: q.sundayShifts, fill: 'bg-sun-bg', c: 'text-sun' },
        { label: 'Saturdays', v: q.saturdayShifts, fill: 'bg-sat-bg', c: 'text-sat' },
        { label: 'Weekday hrs', v: q.weekdayOtHours, fill: 'bg-accent-bg', c: 'text-accent' },
      ].map((t, i) => (
        <div key={t.label} style={{ '--i': i } as CSSProperties} className={`anim-fade-up rounded-xl p-3 ${t.fill}`}>
          <div className="truncate text-xs text-slate-500">{t.label}</div>
          <div className={`text-2xl font-bold tabular-nums tracking-[-0.02em] ${t.c}`}>{num(t.v)}</div>
        </div>
      ))}
    </div>
  );

  return (
    <Card title="Target mode" subtitle="Minimum OT to reach a net pay goal — Sundays first, then Saturdays, then weekday OT">
      <div className="grid gap-5 md:grid-cols-[15rem_minmax(0,1fr)]">
        <Field
          label="Target net pay"
          error={parsed.error}
          hint={`Base: salary + ${config.rules.targetNormalShifts} shifts, no OT or public holidays, fixed deductions only (change in Settings). Each Sat/Sun also adds ${money(config.rules.shiftAllowancePerShift)} shift allowance.`}
        >
          <NumInput value={targetNet} onChange={onTargetChange} error={parsed.error} prefix="S$" placeholder="e.g. 3500" />
        </Field>

        <div className="min-w-0">
          {!cycle && <ErrorText>Fix the month/year to use target mode.</ErrorText>}
          {cycle && !outcome && !parsed.error && (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              Enter a target to see the minimum combo.
            </div>
          )}
          {outcome && (
            <div key={parsed.value} className="anim-tab space-y-4">
              {outcome.combo.sundayShifts + outcome.combo.saturdayShifts + outcome.combo.weekdayOtHours === 0 && outcome.reachable ? (
                <p className="flex items-center gap-2 rounded-xl bg-tile-mint p-4 text-sm text-slate-700">
                  <CircleCheck size={18} strokeWidth={1.5} className="text-good" aria-hidden />
                  No OT needed — base net is already {money(outcome.baseNet)}.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {outcome.reachable ? <Badge tone="green">Reachable</Badge> : <Badge tone="red">Not reachable this cycle</Badge>}
                    <span className="text-sm text-slate-500">
                      Net <span className="font-medium text-slate-900">{money(outcome.result.net)}</span> · Gross {money(outcome.result.gross)}
                    </span>
                  </div>
                  <TargetProgress target={parsed.value} outcome={outcome} />
                  <ComboTiles q={outcome.combo} />
                  {!outcome.reachable && (
                    <p className="anim-slide-in text-sm text-bad">
                      Even working every weekend + OT every weekday falls {money(outcome.shortfall)} short.
                    </p>
                  )}
                  {outcome.reachable && (
                    <button type="button" onClick={() => onApply(outcome.combo)} className={btnPrimary}>
                      Use this combo in calculator <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
                    </button>
                  )}
                </>
              )}

              {outcome.alternatives.length > 0 && (
                <details className="group rounded-xl border border-slate-200">
                  <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                    Other combos with fewer Sundays <span className="text-slate-400">({outcome.alternatives.length})</span>
                  </summary>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.05em] text-slate-500">
                        <th className="py-2 pl-4 font-medium">Sun</th><th className="font-medium">Sat</th><th className="font-medium">Wkday hrs</th>
                        <th className="text-right font-medium">Net</th><th className="pr-4" />
                      </tr>
                    </thead>
                    <tbody>
                      {outcome.alternatives.map((a) => (
                        <tr key={a.combo.sundayShifts} className="border-t border-slate-100 transition-colors hover:bg-slate-50">
                          <td className="py-2 pl-4 tabular-nums">{a.combo.sundayShifts}</td>
                          <td className="tabular-nums">{a.combo.saturdayShifts}</td>
                          <td className="tabular-nums">{num(a.combo.weekdayOtHours)}</td>
                          <td className="text-right tabular-nums">{money(a.net)}</td>
                          <td className="pr-4 text-right">
                            <button type="button" onClick={() => onApply(a.combo)} className="rounded-md px-2 py-1 text-xs font-medium text-slate-900 transition hover:bg-slate-100 active:scale-95">Use</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
