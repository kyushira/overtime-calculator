import { Save } from 'lucide-react';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { usePayrollForm } from '../hooks/usePayrollForm';
import type { FormState } from '../types/form';
import type { PayrollConfig } from '../types/payroll';
import { money } from '../utils/format';
import {
  buildSnapshot,
  deleteMonth,
  EMPTY_STORE,
  migrateMonthsStore,
  MONTHS_STORAGE_KEY,
  monthLabel,
  type MonthsStore,
  type SavedMonth,
  upsertMonth,
} from '../utils/months';
import { BackupCard } from './months/BackupCard';
import { HistoryCard } from './months/HistoryCard';
import { PlanCard } from './months/PlanCard';
import { fmtSavedDate, maskMoney, type Fmt } from './months/shared';
import { btnPrimary, Card, SectionLabel } from './ui';

interface Props {
  form: FormState;
  config: PayrollConfig;
  /** Return value of usePayrollForm for the calculator's current month. */
  calc: ReturnType<typeof usePayrollForm>;
  /** Privacy toggle from the summary tiles: masks money figures on this tab too. */
  hidden: boolean;
  onLoadMonth: (form: FormState) => void;
  onSetTarget: (net: number) => void;
  onImportConfig: (raw: unknown) => void;
}

/** Save months, see history and trend, plan the next month, and back up as JSON. */
export function MonthsTab({ form, config, calc, hidden, onLoadMonth, onSetTarget, onImportConfig }: Props) {
  const [store, setStore] = useLocalStorage<MonthsStore>(MONTHS_STORAGE_KEY, EMPTY_STORE, migrateMonthsStore);
  const fmt: Fmt = hidden ? maskMoney : money;

  const openMonth = (m: SavedMonth) => {
    const label = monthLabel(m.year, m.month);
    if (window.confirm(`Load ${label} into the calculator? Current inputs will be replaced.`)) onLoadMonth(m.form);
  };
  const removeMonth = (m: SavedMonth) => {
    if (window.confirm(`Delete the saved ${monthLabel(m.year, m.month)}?`)) setStore((s) => deleteMonth(s, m.id));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <ThisMonthCard form={form} calc={calc} store={store} setStore={setStore} fmt={fmt} />
      <HistoryCard months={store.months} fmt={fmt} onOpen={openMonth} onDelete={removeMonth} />
      <PlanCard store={store} setStore={setStore} form={form} config={config} fmt={fmt} onSetTarget={onSetTarget} />
      <BackupCard store={store} setStore={setStore} config={config} onImportConfig={onImportConfig} />
    </div>
  );
}

function ThisMonthCard({ form, calc, store, setStore, fmt }: {
  form: FormState;
  calc: ReturnType<typeof usePayrollForm>;
  store: MonthsStore;
  setStore: Dispatch<SetStateAction<MonthsStore>>;
  fmt: Fmt;
}) {
  const [notice, setNotice] = useState('');
  // Computed on every render (cheap); savedAt is set when the user actually saves.
  const snap = buildSnapshot(form, calc);
  const label = snap ? monthLabel(snap.year, snap.month) : null;
  const existing = snap ? store.months.find((m) => m.id === snap.id) : undefined;
  const blocked = !snap
    ? 'Pick a valid payout month and year in the calculator first.'
    : Object.keys(calc.errors).length > 0
      ? 'Fix the highlighted inputs in the calculator to save.'
      : null;

  const save = () => {
    if (!snap || blocked || !label) return;
    if (existing && !window.confirm(`Replace the saved ${label}?`)) return;
    const fresh = { ...snap, savedAt: new Date().toISOString() };
    setStore((s) => upsertMonth(s, fresh));
    setNotice(`Saved ${label}`);
  };

  const { result } = calc;
  return (
    <Card title="This month" subtitle={label ? `Payout ${label}` : 'No payout month set'} index={0} className="lg:col-start-1 lg:row-start-1">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <SectionLabel>Net pay</SectionLabel>
          <div className="text-[28px] font-extrabold tabular-nums tracking-[-0.02em] text-slate-900">{fmt(result.net)}</div>
        </div>
        <div className="text-right text-xs tabular-nums text-slate-500">
          <div>Gross {fmt(result.gross)}</div>
          <div>Deductions {fmt(result.totalDeductions)}</div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <button
          type="button"
          onClick={save}
          disabled={!!blocked}
          aria-describedby="months-save-hint"
          className={`${btnPrimary} w-full py-2.5 disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <Save size={16} strokeWidth={1.5} aria-hidden /> {label ? `Save ${label}` : 'Save month'}
        </button>
        <p id="months-save-hint" className="text-xs text-slate-500">
          {blocked ?? (existing ? `Replaces the copy saved ${fmtSavedDate(existing.savedAt)}.` : 'Keeps these inputs and figures for this payout month.')}
          {form.inputMode === 'log' && ' Calendar days are saved too.'}
        </p>
        <div role="status" aria-live="polite">
          {notice && <p className="anim-slide-in text-xs font-medium text-good">{notice}</p>}
        </div>
      </div>
    </Card>
  );
}
