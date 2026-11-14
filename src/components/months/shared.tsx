import type { PlanState } from '../../utils/months';
import { MONTHS } from '../../utils/format';
import { Field, inputClass } from '../ui';

/** Money formatter; becomes a mask when pay figures are hidden (privacy toggle). */
export type Fmt = (n: number) => string;

export const maskMoney: Fmt = () => '••••';

/** Saved-at ISO timestamp as a short date, or a dash when unreadable. */
export function fmtSavedDate(iso: string): string {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? '—' : t.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-100/70 p-3">
      <div className="truncate text-[11px] font-medium text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-bold tabular-nums tracking-[-0.01em] text-slate-900 sm:text-base">{value}</div>
    </div>
  );
}

/** Payout month + year, same layout and validation style as the calculator's Inputs card. */
export function MonthPicker({ year, month, error, onChange }: {
  year: string;
  month: string;
  error?: string;
  onChange: (p: Partial<Pick<PlanState, 'year' | 'month'>>) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_7rem] gap-3">
      <Field label="Payout month" error={error}>
        <select value={month} onChange={(e) => onChange({ month: e.target.value })} className={inputClass(error)}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      </Field>
      <Field label="Year">
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          value={year}
          aria-invalid={!!error}
          onChange={(e) => onChange({ year: e.target.value.replace(/\D/g, '') })}
          className={inputClass(error)}
        />
      </Field>
    </div>
  );
}
