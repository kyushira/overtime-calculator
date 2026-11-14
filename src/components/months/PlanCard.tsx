import { RotateCcw, Target, TriangleAlert } from 'lucide-react';
import { useMemo, type Dispatch, type SetStateAction } from 'react';
import { usePayrollForm } from '../../hooks/usePayrollForm';
import type { FormState } from '../../types/form';
import type { PayrollConfig } from '../../types/payroll';
import { defaultPlan, diffVsLast, monthLabel, planToForm, type MonthsStore, type PlanState } from '../../utils/months';
import { round2 } from '../../utils/payroll';
import { validateMonthYear } from '../../utils/validation';
import { Badge, btnGhost, btnPrimary, Card, Field, NumInput, SectionLabel } from '../ui';
import { Fmt, MonthPicker } from './shared';

interface Props {
  store: MonthsStore;
  setStore: Dispatch<SetStateAction<MonthsStore>>;
  form: FormState;
  config: PayrollConfig;
  fmt: Fmt;
  onSetTarget: (net: number) => void;
}

/** Plan the next payout month: editable shifts, live projected net, compared with the last saved month. */
export function PlanCard({ store, setStore, form, config, fmt, onSetTarget }: Props) {
  const plan = useMemo(() => store.plan ?? defaultPlan(store.months, form), [store.plan, store.months, form]);
  const planForm = useMemo(() => planToForm(plan, form), [plan, form]);
  const planCalc = usePayrollForm(planForm, config);
  const { result, errors, warnings } = planCalc;

  const cmp = diffVsLast(result.net, store.months);
  const otherTotal = result.otherDeductions.reduce((s, d) => s + d.amount, 0);
  const hasErrors = Object.keys(errors).length > 0;
  const planned = validateMonthYear(plan.year, plan.month);
  const plannedNotAfterLatest =
    cmp.last !== null && !planned.error && planned.year * 12 + planned.month <= cmp.last.year * 12 + cmp.last.month;

  const patch = (p: Partial<PlanState>) =>
    setStore((s) => ({ ...s, plan: { ...(s.plan ?? defaultPlan(s.months, form)), ...p } }));
  const field = (k: keyof PlanState) => (v: string) => patch({ [k]: v } as Partial<PlanState>);

  const diffText = cmp.diff === null ? '' : `${cmp.diff > 0 ? '+' : cmp.diff < 0 ? '−' : ''}${fmt(Math.abs(cmp.diff))}`;

  return (
    <Card title="Plan next month" subtitle="Projected from the numbers you type here" index={2} className="lg:col-start-1 lg:row-start-2">
      <div className="space-y-4">
        <MonthPicker year={plan.year} month={plan.month} error={errors.monthYear} onChange={patch} />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Normal shifts" error={errors.normalShifts}>
            <NumInput value={plan.normalShifts} onChange={field('normalShifts')} error={errors.normalShifts} step="1" suffix="shifts" ariaLabel="Planned normal shifts" />
          </Field>
          <Field label="Weekday OT" error={errors.weekdayOtHours} hint="Hours">
            <NumInput value={plan.weekdayOtHours} onChange={field('weekdayOtHours')} error={errors.weekdayOtHours} step="0.25" suffix="hrs" ariaLabel="Planned weekday OT hours" />
          </Field>
          <Field label="Saturday shifts" error={errors.saturdayShifts}>
            <NumInput value={plan.saturdayShifts} onChange={field('saturdayShifts')} error={errors.saturdayShifts} step="1" suffix="shifts" ariaLabel="Planned Saturday shifts" />
          </Field>
          <Field label="Sunday shifts" error={errors.sundayShifts}>
            <NumInput value={plan.sundayShifts} onChange={field('sundayShifts')} error={errors.sundayShifts} step="1" suffix="shifts" ariaLabel="Planned Sunday shifts" />
          </Field>
          <Field label="Public holiday shifts" error={errors.publicHolidayShifts} className="col-span-2">
            <NumInput value={plan.publicHolidayShifts} onChange={field('publicHolidayShifts')} error={errors.publicHolidayShifts} step="1" suffix="shifts" ariaLabel="Planned public holiday shifts" />
          </Field>
        </div>

        {warnings.length > 0 && (
          <ul className="space-y-1 rounded-lg bg-sat-bg p-3 text-xs text-sat">
            {warnings.map((w) => (
              <li key={w} className="anim-slide-in flex items-start gap-1.5">
                <TriangleAlert size={14} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden /> {w}
              </li>
            ))}
          </ul>
        )}

        <div>
          <SectionLabel className="mb-2">Projected</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0 rounded-xl bg-tile-blue px-3 py-2.5">
              <div className="truncate text-[11px] font-medium text-slate-500">Gross pay</div>
              <div className="font-bold tabular-nums text-slate-900">{fmt(result.gross)}</div>
            </div>
            <div className="min-w-0 rounded-xl bg-tile-lav px-3 py-2.5">
              <div className="truncate text-[11px] font-medium text-slate-500">CPF</div>
              <div className="font-bold tabular-nums text-slate-900">−{fmt(result.cpf)}</div>
            </div>
            <div className="min-w-0 rounded-xl bg-tile-peach px-3 py-2.5">
              <div className="truncate text-[11px] font-medium text-slate-500">Other deductions</div>
              <div className="font-bold tabular-nums text-slate-900">−{fmt(otherTotal)}</div>
            </div>
            <div className="min-w-0 rounded-xl bg-tile-mint px-3 py-2.5 ring-1 ring-good/25">
              <div className="truncate text-[11px] font-medium text-slate-500">Net pay</div>
              <div className="text-[22px] font-extrabold tabular-nums tracking-[-0.02em] text-slate-900">{fmt(result.net)}</div>
            </div>
          </div>
          <div className="mt-3">
            {cmp.last && cmp.diff !== null ? (
              <Badge tone={cmp.diff >= 0 ? 'green' : 'red'}>
                vs {monthLabel(cmp.last.year, cmp.last.month)}: {diffText}
              </Badge>
            ) : (
              <span className="text-xs text-slate-500">Save a month to compare</span>
            )}
          </div>
          {cmp.last && plannedNotAfterLatest && (
            <p className="mt-2 rounded-lg bg-sat-bg p-2 text-xs text-sat">
              This month is already saved or earlier — the comparison is against {monthLabel(cmp.last.year, cmp.last.month)}.
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">Plan ignores one-off custom deductions.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={hasErrors}
            onClick={() => onSetTarget(round2(result.net))}
            aria-describedby={hasErrors ? 'plan-target-hint' : undefined}
            className={`${btnPrimary} min-h-11 disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <Target size={16} strokeWidth={1.5} aria-hidden /> Set as Target goal
          </button>
          <button
            type="button"
            disabled={store.plan === null}
            onClick={() => setStore((s) => ({ ...s, plan: null }))}
            className={`${btnGhost} min-h-11 disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <RotateCcw size={16} strokeWidth={1.5} aria-hidden /> Reset plan
          </button>
        </div>
        {hasErrors && (
          <p id="plan-target-hint" className="text-xs text-slate-500">
            Fix the plan inputs above first.
          </p>
        )}
      </div>
    </Card>
  );
}
