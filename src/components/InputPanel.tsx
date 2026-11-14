import { Lock, Plus, TriangleAlert, X } from 'lucide-react';
import type { FormErrors, FormState } from '../types/form';
import { useId } from 'react';
import type { OtQuantities, PayCycle, PayrollConfig, PayResult } from '../types/payroll';
import { money, MONTHS, num } from '../utils/format';
import { OtLog } from './OtLog';
import { Card, ErrorText, Field, inputClass, NumInput, SectionLabel, Segmented } from './ui';

interface Props {
  form: FormState;
  update: (patch: Partial<FormState>) => void;
  errors: FormErrors;
  warnings: string[];
  cycle: PayCycle | null;
  quantities: OtQuantities;
  /** Normal shifts in use (typed, or counted from the calendar). */
  normalShifts: number;
  /** Public holidays in use (typed, or counted from the calendar). */
  publicHolidayShifts: number;
  /** True when totals come from the calendar ("Pick dates" with a valid cycle). */
  fromCalendar: boolean;
  config: PayrollConfig;
  /** Current payroll result; the live S$ under each OT / shift field reads its line items. */
  result: PayResult;
  /** Amounts hidden (eye toggle): no live S$ lines. */
  hidden: boolean;
}

/**
 * Live S$ for one OT / shift field: the same line amount Breakdown shows. Display only.
 * Rendered only when `id` is set (see liveId); the input points at it with aria-describedby.
 */
function LiveAmount({ id, amount, tone }: { id?: string; amount: number | undefined; tone: string }) {
  if (!id || !amount) return null;
  return <span id={id} className={`mt-1 block text-right text-xs font-medium tabular-nums ${tone}`}>= {money(amount)}</span>;
}

export function InputPanel({ form, update, errors, warnings, cycle, quantities, normalShifts, publicHolidayShifts, fromCalendar, config, result, hidden }: Props) {
  const perShift = config.rules.shiftAllowancePerShift;
  const lineAmount = (key: string) => result.earnings.find((l) => l.key === key)?.amount;
  const { fullShiftHours, saturdayMultiplier, sundayMultiplier } = config.rules;
  // Live S$ id per OT / shift field: set only when the amount is shown (non-zero entry, not hidden).
  const liveBase = useId();
  const liveId = (key: string, value: string, amount: number | undefined) =>
    !hidden && Number(value) > 0 && amount ? `${liveBase}-${key}` : undefined;
  const liveWeekday = liveId('weekday', form.weekdayOtHours, lineAmount('ot-weekday'));
  const liveSaturday = liveId('saturday', form.saturdayShifts, lineAmount('ot-saturday'));
  const liveSunday = liveId('sunday', form.sundayShifts, lineAmount('ot-sunday'));
  const livePh = liveId('ph', form.publicHolidayShifts, lineAmount('ot-ph'));

  // Leaving "Pick dates" carries the calendar totals into the typed fields
  // (if any days are marked). Going the other way can't infer dates, so the
  // calendar is left as it was.
  const switchMode = (inputMode: FormState['inputMode']) => {
    const marked = normalShifts + quantities.saturdayShifts + quantities.sundayShifts + publicHolidayShifts > 0;
    if (inputMode === 'totals' && fromCalendar && marked) {
      update({
        inputMode,
        normalShifts: String(normalShifts),
        weekdayOtHours: quantities.weekdayOtHours ? String(quantities.weekdayOtHours) : '',
        saturdayShifts: quantities.saturdayShifts ? String(quantities.saturdayShifts) : '',
        sundayShifts: quantities.sundayShifts ? String(quantities.sundayShifts) : '',
        publicHolidayShifts: publicHolidayShifts ? String(publicHolidayShifts) : '',
      });
    } else update({ inputMode });
  };

  const addDeduction = () =>
    update({ customDeductions: [...form.customDeductions, { id: crypto.randomUUID(), label: '', amount: '' }] });

  return (
    <Card title="Inputs" subtitle="Results update as you type" index={0}>
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Payout month" error={errors.monthYear}>
            <select value={form.month} onChange={(e) => update({ month: e.target.value })} className={inputClass(errors.monthYear)}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </Field>
          <Field label="Year">
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={form.year}
              pattern="[0-9]{4}"
              autoComplete="off"
              onChange={(e) => update({ year: e.target.value.replace(/\D/g, '') })}
              className={inputClass(errors.monthYear)}
            />
          </Field>
        </div>

        <div>
          <SectionLabel className="mb-1.5">Shifts & overtime</SectionLabel>
          <Segmented
            ariaLabel="Input mode"
            value={form.inputMode}
            options={[{ value: 'totals', label: 'Enter totals' }, { value: 'log', label: 'Pick dates' }]}
            onChange={switchMode}
          />
        </div>

        {fromCalendar ? (
          <div>
            <div className="mb-1.5 text-[13px] font-medium text-slate-700">Normal shifts worked</div>
            <div
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm"
              aria-label={`Normal shifts worked: ${normalShifts}, counted from the calendar`}
            >
              <span className="font-semibold tabular-nums text-slate-900">{normalShifts} shifts</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                <Lock size={12} strokeWidth={1.75} aria-hidden /> from calendar
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Auto-counted from weekdays marked worked. {money(perShift)} allowance each, weekend OT shifts included.</p>
          </div>
        ) : (
          <Field
            label="Normal shifts worked"
            error={errors.normalShifts}
            hint={`Weekday shifts only. ${money(perShift)} allowance each.`}
          >
            <NumInput value={form.normalShifts} onChange={(v) => update({ normalShifts: v })} error={errors.normalShifts} step="1" suffix="shifts" ariaLabel="Normal shifts worked" />
          </Field>
        )}

        {form.inputMode === 'totals' || !cycle ? (
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Weekday OT"
              error={errors.weekdayOtHours}
              hint="Quarter hours OK, e.g. 6.25"
              aside={<LiveAmount id={liveWeekday} amount={lineAmount('ot-weekday')} tone="text-accent" />}
            >
              <NumInput value={form.weekdayOtHours} onChange={(v) => update({ weekdayOtHours: v })} error={errors.weekdayOtHours} step="0.25" suffix="hrs" ariaLabel="Weekday OT hours" describedBy={liveWeekday} />
            </Field>
            <Field
              label="Saturday shifts"
              error={errors.saturdayShifts}
              hint={`Number of Saturday shifts (${num(fullShiftHours)} hrs each, ${saturdayMultiplier}x). ${money(perShift)} allowance added.`}
              aside={<LiveAmount id={liveSaturday} amount={lineAmount('ot-saturday')} tone="text-sat" />}
            >
              <NumInput value={form.saturdayShifts} onChange={(v) => update({ saturdayShifts: v })} error={errors.saturdayShifts} step="1" suffix="shifts" ariaLabel="Saturday shifts" describedBy={liveSaturday} />
            </Field>
            <Field
              label="Sunday shifts"
              error={errors.sundayShifts}
              hint={`Number of Sunday shifts (${sundayMultiplier}x). ${money(perShift)} allowance added.`}
              aside={<LiveAmount id={liveSunday} amount={lineAmount('ot-sunday')} tone="text-sun" />}
            >
              <NumInput value={form.sundayShifts} onChange={(v) => update({ sundayShifts: v })} error={errors.sundayShifts} step="1" suffix="shifts" ariaLabel="Sunday shifts" describedBy={liveSunday} />
            </Field>
            <Field
              label="Public holiday shifts"
              error={errors.publicHolidayShifts}
              hint={`Number of PH shifts (${sundayMultiplier}x, same as Sunday). ${money(perShift)} allowance added.`}
              aside={<LiveAmount id={livePh} amount={lineAmount('ot-ph')} tone="text-ph" />}
            >
              <NumInput value={form.publicHolidayShifts} onChange={(v) => update({ publicHolidayShifts: v })} error={errors.publicHolidayShifts} step="1" suffix="shifts" ariaLabel="Public holiday shifts" describedBy={livePh} />
            </Field>
          </div>
        ) : (
          <OtLog
            cycle={cycle}
            entries={form.entries}
            onChange={(entries) => update({ entries })}
            otHours={{ short: config.rules.weekdayOtHoursPerDay, long: config.rules.weekdayOtHoursLong }}
            totals={{ ...quantities, normalShifts, publicHolidayShifts }}
            shiftAllowancePerShift={perShift}
          />
        )}

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
          <div className="mb-1 flex items-center justify-between">
            <SectionLabel>Deductions</SectionLabel>
            <button type="button" onClick={addDeduction} className="inline-flex items-center gap-1 min-h-11 min-w-11 rounded-lg px-2 py-1 text-[13px] font-medium text-slate-900 transition hover:bg-slate-100 active:scale-[0.97]">
              <Plus size={14} strokeWidth={1.75} aria-hidden /> Add custom
            </button>
          </div>
          <ul className="space-y-1 text-sm text-slate-600">
            {config.defaultDeductions.map((d) => (
              <li key={d.id} className="flex justify-between rounded-lg bg-slate-100 px-3 py-2">
                <span>{d.label}</span>
                <span className="tabular-nums">{money(d.amount)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 space-y-2">
            {form.customDeductions.map((d) => {
              const err = errors[`deduction-${d.id}`];
              const set = (patch: Partial<typeof d>) =>
                update({ customDeductions: form.customDeductions.map((x) => (x.id === d.id ? { ...x, ...patch } : x)) });
              return (
                <div key={d.id}>
                  <div className="flex gap-2">
                    <input
                      value={d.label}
                      onChange={(e) => set({ label: e.target.value })}
                      placeholder="e.g. Union fee"
                      aria-label="Deduction name"
                      className={`${inputClass()} flex-1`}
                    />
                    <div className="w-28 shrink-0">
                      <NumInput value={d.amount} onChange={(amount) => set({ amount })} error={err} prefix="S$" ariaLabel="Deduction amount" />
                    </div>
                    <button
                      type="button"
                      aria-label="Remove deduction"
                      onClick={() => update({ customDeductions: form.customDeductions.filter((x) => x.id !== d.id) })}
                      className="min-h-11 min-w-11 rounded-lg px-2 text-slate-400 transition hover:bg-bad-bg hover:text-bad active:scale-95"
                    >
                      <X size={16} strokeWidth={1.5} aria-hidden />
                    </button>
                  </div>
                  {err && <ErrorText key={err}>{err}</ErrorText>}
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-slate-500">Default deductions are editable in Settings.</p>
        </div>
      </div>
    </Card>
  );
}
