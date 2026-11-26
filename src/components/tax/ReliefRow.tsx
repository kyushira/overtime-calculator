import { Minus, Plus } from 'lucide-react';
import type { ReliefId } from '../../tax';
import { money, moneyWhole } from '../../utils/format';
import { btnOutline, Badge, Field } from '../ui';
import { AmountInput } from './AmountInput';
import type { EntryState, TaxRow } from './taxModel';

interface Props {
  row: TaxRow;
  ya: number;
  setEntry: (id: ReliefId, patch: Partial<EntryState>) => void;
}

const stepBtn = `${btnOutline} min-h-11 min-w-11 px-0 disabled:opacity-40`;

interface StepperProps {
  label: string;
  singular: string;
  value: number;
  /** Largest value the counter can reach on its own (the relief's maxUnits). */
  max: number;
  /** Headroom left for this counter after the other counters in the same relief. */
  room: number;
  onChange: (v: number) => void;
}

/** Integer counter with − / + buttons. `room` limits the + button. */
function Stepper({ label, singular, value, max, room, onChange }: StepperProps) {
  return (
    <div role="group" aria-label={label} className="min-w-0">
      <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Remove one ${singular}`}
          disabled={value <= 0}
          onClick={() => onChange(value - 1)}
          className={stepBtn}
        >
          <Minus size={16} strokeWidth={1.5} aria-hidden />
        </button>
        <output aria-live="polite" className="min-w-8 text-center text-sm font-medium tabular-nums text-slate-900">
          {value}
        </output>
        <button
          type="button"
          aria-label={`Add one ${singular}`}
          disabled={room <= 0 || value >= max}
          onClick={() => onChange(value + 1)}
          className={stepBtn}
        >
          <Plus size={16} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** One relief: eligibility, tier, units, amount, cap. Every figure comes from the row. */
export function ReliefRow({ row, ya, setEntry }: Props) {
  const { id, meta, available, eligible, cap, claimed, entered, isSuggested, tiers, tierId, units } = row;
  const off = !available || !eligible;
  const noteId = `tax-${id}-note`;
  const capped = eligible && available && entered !== null && entered > cap;
  const unitName = meta.unitLabel ?? '';
  const singular = unitName.replace(/s$/, '');

  return (
    <li className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={eligible}
            disabled={!available}
            onChange={(e) => setEntry(id, { eligible: e.target.checked })}
            className="mt-1 size-4 shrink-0 accent-slate-900 disabled:cursor-not-allowed"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-900">I qualify: {meta.label}</span>
            <span className="block text-xs text-slate-500">{meta.blurb}</span>
          </span>
        </label>
        {!available ? (
          <Badge tone="slate" dot={false}>
            Not available in YA{ya}
          </Badge>
        ) : (
          isSuggested && <Badge tone="indigo">Suggested</Badge>
        )}
      </div>

      <fieldset disabled={off} className={`min-w-0 space-y-3 border-0 p-0 ${off ? 'opacity-50' : ''}`}>
        {tiers.length > 0 && (
          <Field label="Tier">
            <select
              value={tierId ?? ''}
              onChange={(e) => setEntry(id, { tier: e.target.value })}
              className="min-h-11 w-full min-w-0 appearance-none rounded-lg border border-slate-200 bg-surface px-3 py-2 text-sm text-slate-900 hover:border-slate-300 focus:border-slate-400"
            >
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} · {moneyWhole(t.amount)}
                </option>
              ))}
            </select>
          </Field>
        )}

        {id === 'wmcr' ? (
          <>
            <Stepper
              label="Children born before 2024"
              singular="pre-2024 child"
              value={row.unitsPre2024}
              max={meta.maxUnits ?? 0}
              room={(meta.maxUnits ?? 0) - units}
              onChange={(v) => setEntry(id, { unitsPre2024: v })}
            />
            <Stepper
              label="Children born or adopted 2024 or later"
              singular="2024+ child"
              value={units}
              max={meta.maxUnits ?? 0}
              room={(meta.maxUnits ?? 0) - row.unitsPre2024}
              onChange={(v) => setEntry(id, { units: v })}
            />
          </>
        ) : (
          meta.unitLabel && (
            <Stepper
              label={`Number of ${unitName}`}
              singular={singular}
              value={units}
              max={meta.maxUnits ?? 0}
              room={meta.maxUnits !== undefined ? meta.maxUnits - units : Infinity}
              onChange={(v) => setEntry(id, { units: v })}
            />
          )
        )}

        <Field
          label="Amount"
          className="min-w-0"
          aside={
            <div id={noteId} className="mt-1 space-y-0.5 text-xs text-slate-500">
              {eligible && available && (
                <span className="block tabular-nums">
                  Counts {money(claimed)} · cap {moneyWhole(cap)}
                </span>
              )}
              {capped && <span className="block text-sat">capped at {moneyWhole(cap)}</span>}
              {meta.autoSuggest && !isSuggested && entered !== null && (
                <button
                  type="button"
                  onClick={() => setEntry(id, { amount: null })}
                  className="min-h-11 py-2 text-left font-medium text-accent underline-offset-2 hover:underline"
                >
                  Use suggestion
                </button>
              )}
              {meta.autoSuggest && isSuggested && <span className="block">Automatic suggestion. Type to override.</span>}
              {row.cpfEstimate && (
                <span className="block">
                  Estimated: 16% employee CPF rate for ages 56–60 (2024) not yet confirmed from CPF Board.
                </span>
              )}
            </div>
          }
        >
          <AmountInput
            value={isSuggested ? claimed : entered}
            prefix="S$"
            ariaLabel={`${meta.label} amount in S$`}
            describedBy={noteId}
            onChange={(v) => setEntry(id, { amount: v })}
          />
        </Field>
      </fieldset>
    </li>
  );
}
