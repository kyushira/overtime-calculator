import { Calculator, ReceiptText, Settings, Target, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Breakdown } from './components/Breakdown';
import { CycleInfo } from './components/CycleInfo';
import { InputPanel } from './components/InputPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { SummaryCards } from './components/SummaryCards';
import { TargetMode } from './components/TargetMode';
import { btnOutline, SectionLabel } from './components/ui';
import { useLocalStorage } from './hooks/useLocalStorage';
import { usePayrollForm } from './hooks/usePayrollForm';
import { type Tab, useTab } from './hooks/useTab';
import type { FormState } from './types/form';
import type { OtQuantities, PayrollConfig } from './types/payroll';
import { DEFAULT_CONFIG, DEFAULT_NORMAL_SHIFTS } from './utils/defaults';
import { migrateConfig, migrateForm } from './utils/migrate';

/** Default payout month: this month if payday hasn't passed, else next month. */
function defaultPayoutMonth(payDay: number) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + (now.getDate() > payDay ? 1 : 0), 1);
  return { year: String(d.getFullYear()), month: String(d.getMonth() + 1) };
}

const initialForm = (): FormState => ({
  ...defaultPayoutMonth(DEFAULT_CONFIG.payDay),
  normalShifts: String(DEFAULT_NORMAL_SHIFTS),
  inputMode: 'totals',
  weekdayOtHours: '',
  saturdayShifts: '',
  sundayShifts: '',
  publicHolidayShifts: '',
  entries: [],
  customDeductions: [],
  targetNet: '',
});

const TAB_ITEMS: { id: Tab; label: string; icon: LucideIcon; blurb: string }[] = [
  { id: 'calculator', label: 'Calculator', icon: Calculator, blurb: 'Shifts, overtime and deductions for the month' },
  { id: 'breakdown', label: 'Breakdown', icon: ReceiptText, blurb: 'Where your gross comes from, line by line' },
  { id: 'target', label: 'Target', icon: Target, blurb: 'Minimum OT to reach a net pay goal' },
  { id: 'settings', label: 'Settings', icon: Settings, blurb: 'Pay rules, CPF and deductions' },
];

const ICON = { size: 18, strokeWidth: 1.5 } as const;
const NAV_ROW = 44; // px: 40px item + 4px gap, used by the sliding indicator

function Logo() {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink text-white">
      <Calculator size={16} strokeWidth={1.75} aria-hidden />
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useLocalStorage<PayrollConfig>('otcalc.config.v1', DEFAULT_CONFIG, migrateConfig);
  const [form, setForm] = useLocalStorage<FormState>('otcalc.form.v1', initialForm(), (raw) => migrateForm(raw, initialForm()));
  const [tab, setTab] = useTab();
  // Privacy: mask the 4 summary tiles (remembered across reloads).
  const [hidePay, setHidePay] = useLocalStorage<boolean>('otcalc.hidePay.v1', false, (raw) => raw === true);
  // Bumped on reset so settings inputs remount with fresh values.
  const [settingsKey, setSettingsKey] = useState(0);

  const update = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const { quantities, normalShifts, publicHolidayShifts, fromCalendar, cycle, errors, warnings, result } = usePayrollForm(form, config);

  const tabIdx = TAB_ITEMS.findIndex((t) => t.id === tab);
  const current = TAB_ITEMS[tabIdx];

  const goTo = (t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  const applyCombo = (q: OtQuantities) => {
    update({
      inputMode: 'totals',
      // Same base the combo was computed from: target normal shifts, no public holidays.
      normalShifts: String(config.rules.targetNormalShifts),
      publicHolidayShifts: '',
      sundayShifts: String(q.sundayShifts),
      saturdayShifts: String(q.saturdayShifts),
      weekdayOtHours: String(q.weekdayOtHours),
    });
    goTo('calculator');
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white px-3 py-4 lg:flex">
        <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-2.5 py-2">
          <Logo />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-slate-900">Salary & OT</div>
            <div className="truncate text-xs text-slate-500">Payroll estimator</div>
          </div>
        </div>

        <SectionLabel className="mt-6 mb-2 px-2.5">Main</SectionLabel>
        <nav aria-label="Sections" className="relative">
          {/* Sliding active indicator: outlined box with a thin left accent bar. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-10 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[var(--shadow-card)] transition-transform duration-250 ease-out"
            style={{ transform: `translateY(${tabIdx * NAV_ROW}px)` }}
          >
            <span className="absolute inset-y-0 left-0 w-[3px] bg-ink" />
          </span>
          <ul role="tablist" aria-orientation="vertical" className="relative flex flex-col gap-1">
            {TAB_ITEMS.map((t) => {
              const active = tab === t.id;
              const Icon = t.icon;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    role="tab"
                    id={`tab-${t.id}`}
                    aria-selected={active}
                    aria-controls="panel"
                    onClick={() => goTo(t.id)}
                    className={`flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors duration-200 ${
                      active ? 'text-slate-900' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon {...ICON} aria-hidden />
                    {t.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <p className="mt-auto rounded-lg border border-slate-200 p-3 text-[11px] leading-snug text-slate-400">
          Pay = hours × hourly rate × multiplier. Hourly = 12 × basic ÷ (52 × weekly hours).
        </p>
      </aside>

      <div className="lg:pl-60">
        {/* Top bar */}
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-3 py-2.5 sm:px-6 lg:h-16 lg:py-0">
            <span className="lg:hidden"><Logo /></span>
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold text-slate-900 lg:text-lg">
                <span className="lg:hidden">Salary & OT Calculator</span>
                <span className="hidden lg:inline">{current.label}</span>
              </h1>
              <p className="hidden truncate text-[13px] text-slate-500 sm:block">{current.blurb}</p>
            </div>
          </div>
        </header>

        {/* Pinned KPI tiles */}
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-md">
          <div className="mx-auto max-w-6xl px-3 py-2 sm:px-6 sm:py-4">
            <SummaryCards result={result} hidden={hidePay} onToggleHidden={() => setHidePay((h) => !h)} />
          </div>
        </div>

        <main id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mx-auto max-w-6xl px-3 pt-4 pb-28 sm:px-6 sm:pt-6 lg:pb-10">
          <div key={tab} className="anim-tab space-y-4">
            {tab === 'calculator' && (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]">
                <InputPanel
                  form={form}
                  update={update}
                  errors={errors}
                  warnings={warnings}
                  cycle={cycle}
                  quantities={quantities}
                  normalShifts={normalShifts}
                  publicHolidayShifts={publicHolidayShifts}
                  fromCalendar={fromCalendar}
                  config={config}
                />
                <div className="min-w-0 space-y-4">
                  {cycle && <CycleInfo cycle={cycle} />}
                  <button type="button" onClick={() => goTo('breakdown')} className={`${btnOutline} w-full py-2.5`}>
                    <ReceiptText size={16} strokeWidth={1.5} aria-hidden /> See full breakdown
                  </button>
                </div>
              </div>
            )}

            {tab === 'breakdown' && <Breakdown result={result} />}

            {tab === 'target' && (
              <TargetMode
                targetNet={form.targetNet}
                onTargetChange={(targetNet) => update({ targetNet })}
                cycle={cycle}
                config={config}
                onApply={applyCombo}
              />
            )}

            {tab === 'settings' && (
              <div className="max-w-4xl">
                <SettingsPanel
                  key={settingsKey}
                  config={config}
                  onChange={setConfig}
                  onReset={() => {
                    setConfig(DEFAULT_CONFIG);
                    setSettingsKey((k) => k + 1);
                  }}
                />
              </div>
            )}

            <p className="pt-2 text-center text-xs text-slate-400">
              Estimates only. Unpaid leave and age-based CPF rate changes are not modelled automatically.
            </p>
          </div>
        </main>
      </div>

      {/* Mobile / tablet bottom tab bar (thumb reach) */}
      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_8px_rgba(0,0,0,0.03)] lg:hidden"
      >
        <div role="tablist" className="relative mx-auto grid max-w-xl grid-cols-4">
          <span aria-hidden className="absolute top-0 left-0 h-[2px] w-1/4 transition-transform duration-250 ease-out" style={{ transform: `translateX(${tabIdx * 100}%)` }}>
            <span className="mx-auto block h-full w-10 rounded-full bg-ink" />
          </span>
          {TAB_ITEMS.map((t) => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="panel"
                onClick={() => goTo(t.id)}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-200 active:scale-95 ${
                  active ? 'text-slate-900' : 'text-slate-400'
                }`}
              >
                <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200 ${active ? 'bg-slate-200/70' : ''}`}>
                  <Icon size={20} strokeWidth={1.5} aria-hidden />
                </span>
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
