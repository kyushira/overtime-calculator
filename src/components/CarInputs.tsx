import { RotateCcw, TriangleAlert } from 'lucide-react';
import { parseNum, RUNNING_COSTS, type CarForm, type CarResult } from '../utils/car';
import { applyCoePatch, checkTenureVsCoe, coeMonthsLeft, defaultTenure, splitMonths, switchCoeMode, type CoeMode } from '../utils/coe';
import { money, moneyWhole } from '../utils/format';
import { btnOutline, Card, Field, inputClass, NumInput, SectionLabel } from './ui';

interface Props {
  form: CarForm;
  update: (patch: Partial<CarForm>) => void;
  result: CarResult;
  /** Monthly net pay from the OT calculator, if available (enables "Use OT net pay"). */
  otNet?: number;
  onReset: () => void;
}

const GROUP = 'space-y-3 border-t border-slate-200 pt-4 first:border-t-0 first:pt-0';
/* min-h-11: 44px tap target. aria-pressed styles mark the active preset. */
const presetClass =
  `${btnOutline} min-h-11 w-full text-[13px] aria-pressed:border-accent aria-pressed:bg-accent-bg aria-pressed:text-accent`;

/** Input panel for the car calculator: price, loan, tenure, rate, running costs, salary. */
export function CarInputs({ form, update, result, otNet, onReset }: Props) {
  const capText = result.omvAssumed
    ? 'OMV not entered: assuming OMV above S$20,000 (40% min downpayment). Enter OMV if it is S$20k or less.'
    : `MAS cap: OMV ${result.omv !== null && result.omv <= 20000 ? '≤' : '>'} S$20,000 → max loan ${result.maxLoanPct}%, min ${result.minDownPct}% down.`;

  // The active downpayment field shows what was typed; the other shows the derived value.
  const amtValue = form.downMode === 'amt' ? form.downAmt : result.downAmtText;
  const pctValue = form.downMode === 'pct' ? form.downPct : result.downPctText;

  // COE: months left (null = no COE entered, so the tenure is left as the user set it).
  const today = new Date();
  const coeLeft = coeMonthsLeft(form, today);
  const coeCheck = checkTenureVsCoe(result.tenure.months, coeLeft);
  // A COE value change moves the tenure to the COE's default; a mode switch keeps the tenure.
  const updateCoe = (patch: Partial<CarForm>) => update(applyCoePatch(form, patch, new Date()));
  const setCoeMode = (mode: CoeMode) => update(switchCoeMode(form, mode, new Date()));

  return (
    <Card
      title="Your car"
      subtitle="Edit any figure; everything else updates."
      actions={
        <button type="button" onClick={onReset} className={`${btnOutline} min-h-11`}>
          <RotateCcw size={14} strokeWidth={1.5} aria-hidden /> Reset
        </button>
      }
    >
      <div className="space-y-5">
        <section className={GROUP}>
          <SectionLabel>Car</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={<>Car price <span className="font-normal text-slate-400">(incl. COE)</span></>}
              error={result.negErrors.price}
            >
              <NumInput
                value={form.price}
                prefix="S$"
                ariaLabel="Car price in S$"
                error={result.negErrors.price}
                onChange={(price) => update({ price, downMode: 'pct' })}
              />
            </Field>
            <Field label={<>OMV <span className="font-normal text-slate-400">(optional)</span></>} error={result.negErrors.omv}>
              <NumInput
                value={form.omv}
                prefix="S$"
                placeholder="Optional"
                error={result.negErrors.omv}
                onChange={(omv) => update({ omv })}
              />
            </Field>
          </div>
          <p className="text-xs text-slate-500">{capText}</p>
        </section>

        <section className={GROUP}>
          <SectionLabel>COE left</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={form.coeMode === 'left'}
              onClick={() => setCoeMode('left')}
              className={presetClass}
            >
              Years + months left
            </button>
            <button
              type="button"
              aria-pressed={form.coeMode === 'expiry'}
              onClick={() => setCoeMode('expiry')}
              className={presetClass}
            >
              COE expiry date
            </button>
          </div>
          {form.coeMode === 'left' ? (
            <Field
              label={<>COE left <span className="font-normal text-slate-400">(optional)</span></>}
              hint={coeLeft === null ? 'Blank: no COE tracked, tenure stays as set.' : undefined}
            >
              <div className="grid grid-cols-2 gap-3">
                <NumInput
                  value={form.coeYears}
                  suffix="years"
                  step="1"
                  ariaLabel="COE years left"
                  onChange={(coeYears) => updateCoe({ coeYears })}
                />
                <NumInput
                  value={form.coeMonths}
                  suffix="months"
                  step="1"
                  ariaLabel="COE extra months left"
                  onChange={(coeMonths) => updateCoe({ coeMonths })}
                />
              </div>
            </Field>
          ) : (
            <Field
              label={<>COE expiry date <span className="font-normal text-slate-400">(optional)</span></>}
              hint={coeLeft === null ? 'Blank: no COE tracked, tenure stays as set.' : undefined}
            >
              <input
                type="date"
                value={form.coeExpiry}
                onChange={(e) => updateCoe({ coeExpiry: e.target.value })}
                className={inputClass()}
              />
            </Field>
          )}
        </section>

        <section className={GROUP}>
          <SectionLabel>Loan</SectionLabel>
          <Field label="Downpayment" error={result.downError}>
            <div className="grid grid-cols-2 gap-3">
              <NumInput
                value={amtValue}
                prefix="S$"
                ariaLabel="Downpayment in S$"
                error={result.downError}
                onChange={(downAmt) => update({ downAmt, downMode: 'amt' })}
              />
              <NumInput
                value={pctValue}
                suffix="%"
                ariaLabel="Downpayment in percent"
                error={result.downError}
                onChange={(downPct) => update({ downPct, downMode: 'pct' })}
              />
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={form.downMode === 'pct' && parseNum(form.downPct) === 0}
              onClick={() => update({ downMode: 'pct', downPct: '0' })}
              className={presetClass}
            >
              Full loan (0% down)
            </button>
            <button
              type="button"
              aria-pressed={form.downMode === 'pct' && parseNum(form.downPct) === result.minDownPct}
              onClick={() => update({ downMode: 'pct', downPct: String(result.minDownPct) })}
              className={presetClass}
            >
              MAS minimum ({result.minDownPct}%)
            </button>
          </div>
          {/* The live region is always mounted so screen readers announce the notice when it appears.
              It is visually hidden while there is no notice, so it leaves no empty amber box. */}
          <div role="status" aria-live="polite" className={result.minDownWarning ? undefined : 'sr-only'}>
            {result.minDownWarning && (
              <div className="flex gap-2 rounded-lg border border-sat/20 bg-sat-bg px-3 py-2 text-[13px] text-sat">
                <TriangleAlert size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0" />
                <span>
                  Above MAS loan limit, banks won&apos;t approve this. MAS minimum: {result.minDownPct}% down, at least{' '}
                  <b>{money(result.minDown)}</b> (max loan {moneyWhole(result.maxLoan)}).
                </span>
              </div>
            )}
          </div>
          <div className="flex items-baseline justify-between gap-2 rounded-lg bg-slate-100 px-3 py-2.5 text-sm">
            <span className="text-slate-500">Loan amount</span>
            <b className="tabular-nums text-slate-900">{moneyWhole(result.loan)}</b>
          </div>
          {result.minDownWarning && (
            <div className="flex items-baseline justify-between gap-2 rounded-lg bg-slate-100 px-3 py-2.5 text-sm">
              <span className="text-slate-500">Cash needed up front to reach MAS minimum</span>
              <b className="tabular-nums text-slate-900">{money(result.cashToMinimum)}</b>
            </div>
          )}

          <Field label={<>Loan tenure <span className="font-normal text-slate-400">(max 7 years)</span></>} error={result.tenureError}>
            <div className="grid grid-cols-2 gap-3">
              <NumInput
                value={form.years}
                suffix="years"
                step="1"
                ariaLabel="Tenure years"
                error={result.tenureError}
                onChange={(years) => update({ years })}
              />
              <NumInput
                value={form.months}
                suffix="months"
                step="1"
                ariaLabel="Tenure extra months"
                error={result.tenureError}
                onChange={(months) => update({ months })}
              />
            </div>
          </Field>
          {/* Always mounted so screen readers hear the note when the COE or tenure changes. */}
          <div role="status" aria-live="polite" className={coeLeft === null ? 'sr-only' : undefined}>
            {coeLeft !== null && (
              <div
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-3 py-2 text-[13px] ${
                  coeCheck.overCoe ? 'border border-sat/20 bg-sat-bg text-sat' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {coeCheck.overCoe && <TriangleAlert size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0" />}
                <span className="min-w-0 flex-1">
                  {coeCheck.message}
                  {coeCheck.overCoe && ' Tenure is longer than the COE.'}
                </span>
                <button
                  type="button"
                  onClick={() => update({ ...splitMonths(defaultTenure(coeLeft)) })}
                  className={`${btnOutline} min-h-11 px-3`}
                >
                  Match COE
                </button>
              </div>
            )}
          </div>

          <Field
            label={<>Interest rate <span className="font-normal text-slate-400">(% p.a., flat)</span></>}
            hint="SG car loans are quoted as flat rates: interest on the full loan for the whole tenure, so the effective rate is roughly double."
            error={result.negErrors.rate}
          >
            <NumInput
              value={form.rate}
              suffix="%"
              step="0.01"
              error={result.negErrors.rate}
              onChange={(rate) => update({ rate })}
            />
          </Field>
        </section>

        <section className={GROUP}>
          <SectionLabel>Running costs</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            {RUNNING_COSTS.map((r) => (
              <Field
                key={r.id}
                label={<>{r.label} <span className="font-normal text-slate-400">S$/{r.per === 'year' ? 'yr' : 'mth'}</span></>}
                error={result.negErrors[r.id]}
              >
                <NumInput
                  value={form.running[r.id]}
                  prefix="S$"
                  error={result.negErrors[r.id]}
                  onChange={(v) => update({ running: { ...form.running, [r.id]: v } })}
                />
              </Field>
            ))}
          </div>
        </section>

        <section className={GROUP}>
          <SectionLabel>You</SectionLabel>
          <Field label={<>Monthly salary <span className="font-normal text-slate-400">(optional)</span></>} error={result.negErrors.salary}>
            <NumInput
              value={form.salary}
              prefix="S$"
              placeholder="Optional"
              error={result.negErrors.salary}
              onChange={(salary) => update({ salary })}
            />
          </Field>
          {otNet !== undefined && otNet > 0 && (
            <button
              type="button"
              onClick={() => update({ salary: String(Math.round(otNet * 100) / 100) })}
              className={`${btnOutline} min-h-11 w-full py-2`}
            >
              Use OT net pay ({money(otNet)})
            </button>
          )}
        </section>
      </div>
    </Card>
  );
}
