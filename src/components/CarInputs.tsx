import { RotateCcw, TriangleAlert } from 'lucide-react';
import { RUNNING_COSTS, type CarForm, type CarResult } from '../utils/car';
import { money } from '../utils/format';
import { btnOutline, Card, Field, NumInput, SectionLabel } from './ui';

interface Props {
  form: CarForm;
  update: (patch: Partial<CarForm>) => void;
  result: CarResult;
  /** Monthly net pay from the OT calculator, if available (enables "Use OT net pay"). */
  otNet?: number;
  onReset: () => void;
}

const GROUP = 'space-y-3 border-t border-slate-200 pt-4 first:border-t-0 first:pt-0';

/** Input panel for the car calculator: price, loan, tenure, rate, running costs, salary. */
export function CarInputs({ form, update, result, otNet, onReset }: Props) {
  const capText = result.omvAssumed
    ? 'OMV not entered: assuming OMV above S$20,000 (40% min downpayment). Enter OMV if it is S$20k or less.'
    : `MAS cap: OMV ${result.omv !== null && result.omv <= 20000 ? '≤' : '>'} S$20,000 → max loan ${result.maxLoanPct}%, min ${result.minDownPct}% down.`;

  // The active downpayment field shows what was typed; the other shows the derived value.
  const amtValue = form.downMode === 'amt' ? form.downAmt : result.downAmtText;
  const pctValue = form.downMode === 'pct' ? form.downPct : result.downPctText;

  return (
    <Card
      title="Your car"
      subtitle="Edit any figure; everything else updates."
      actions={
        <button type="button" onClick={onReset} className={btnOutline}>
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
                placeholder="0"
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
          {result.minDownWarning && (
            <div role="alert" className="flex gap-2 rounded-lg border border-bad/20 bg-bad-bg px-3 py-2 text-[13px] text-bad">
              <TriangleAlert size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                Below the MAS minimum of {result.minDownPct}%. Required minimum downpayment:{' '}
                <b>{money(result.minDown)}</b> (max loan {money(result.maxLoan)}).
              </span>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-2 rounded-lg bg-slate-100 px-3 py-2.5 text-sm">
            <span className="text-slate-500">Loan amount</span>
            <b className="tabular-nums text-slate-900">{money(result.loan)}</b>
          </div>

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
              className={`${btnOutline} w-full py-2`}
            >
              Use OT net pay ({money(otNet)})
            </button>
          )}
        </section>
      </div>
    </Card>
  );
}
