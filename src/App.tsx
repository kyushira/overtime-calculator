import { Calculator, Car, CalendarRange, Landmark, ReceiptText, Settings, Target, type LucideIcon } from 'lucide-react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { Breakdown } from './components/Breakdown';
import { CarCalculator } from './components/CarCalculator';
import { CycleInfo } from './components/CycleInfo';
import { InputPanel } from './components/InputPanel';
import { MonthsTab } from './components/MonthsTab';
import { SettingsPanel } from './components/SettingsPanel';
import { SummaryCards } from './components/SummaryCards';
import { TargetMode } from './components/TargetMode';
import { TaxTab } from './components/tax/TaxTab';
import { btnOutline, SectionLabel } from './components/ui';
import { AppearanceCard } from './components/AppearanceCard';
import { PrivacyToggle } from './components/PrivacyToggle';
import { ThemeToggle } from './components/ThemeToggle';
import { BottomBar } from './components/nav/BottomBar';
import { PayCarSwitch } from './components/nav/PayCarSwitch';
import { SummaryStrip } from './components/nav/SummaryStrip';
import { isBarTab, modeOf, nextLastPayTab, parseBarTab, summaryVariant, type BarTab, type Mode } from './components/nav/navModel';
import { useCompactOnScroll } from './hooks/useCompactOnScroll';
import { useLocalStorage } from './hooks/useLocalStorage';
import { usePayrollForm } from './hooks/usePayrollForm';
import { type Tab, useTab } from './hooks/useTab';
import { useTheme } from './hooks/useTheme';
import type { FormState } from './types/form';
import type { OtQuantities, PayrollConfig } from './types/payroll';
import { DEFAULT_CONFIG, DEFAULT_NORMAL_SHIFTS } from './utils/defaults';
import { formatPeriodLabel } from './utils/format';
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
  { id: 'months', label: 'Months', icon: CalendarRange, blurb: 'Save each month, see your history and plan the next one' },
  { id: 'settings', label: 'Settings', icon: Settings, blurb: 'Pay rules, CPF and deductions' },
  { id: 'car', label: 'Car', icon: Car, blurb: 'Car loan, running costs and affordability' },
  { id: 'tax', label: 'Tax', icon: Landmark, blurb: 'Income tax estimate, reliefs and year-end reminders' },
];

/** Pay-mode tabs shown in the bottom bar and the sidebar list (Settings is the header gear). */
const PAY_ITEMS = TAB_ITEMS.filter((t) => isBarTab(t.id));

const ICON = { size: 18, strokeWidth: 1.5 } as const;
const NAV_ROW = 48; // px: 44px item + 4px gap, used by the sliding indicator
const HEADER_BTN = 'grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg transition duration-150 ease-out hover:bg-slate-100 hover:text-slate-900 active:scale-95';

function Logo() {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink text-on-ink">
      <Calculator size={16} strokeWidth={1.75} aria-hidden />
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useLocalStorage<PayrollConfig>('otcalc.config.v1', DEFAULT_CONFIG, migrateConfig);
  const [form, setForm] = useLocalStorage<FormState>('otcalc.form.v1', initialForm(), (raw) => migrateForm(raw, initialForm()));
  const [tab, setTab] = useTab();
  // Last pay tab, so Pay | Car returns to it (remembered across reloads).
  const [lastPay, setLastPay] = useLocalStorage<BarTab>('otcalc.payTab.v1', 'calculator', parseBarTab);
  // Privacy: mask the summary figures (remembered across reloads).
  const [hidePay, setHidePay] = useLocalStorage<boolean>('otcalc.hidePay.v1', false, (raw) => raw === true);
  // Collapsed summary strip (Breakdown, Target, Months): tapped open to the full grid.
  const [summaryOpen, setSummaryOpen] = useState(false);
  // Bumped on reset so settings inputs remount with fresh values.
  const [settingsKey, setSettingsKey] = useState(0);
  // One theme state for the whole app: header toggle and Settings share it.
  const theme = useTheme();
  // Sticky KPI bar collapses to a slim row once the page is scrolled.
  const compact = useCompactOnScroll();

  const update = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const calc = usePayrollForm(form, config);
  const { quantities, normalShifts, publicHolidayShifts, fromCalendar, cycle, errors, warnings, result } = calc;
  const periodLabel = cycle ? formatPeriodLabel(cycle.year, cycle.month) : null;

  const tabIdx = TAB_ITEMS.findIndex((t) => t.id === tab);
  const current = TAB_ITEMS[tabIdx];
  const mode: Mode = modeOf(tab);
  const payIdx = PAY_ITEMS.findIndex((t) => t.id === tab);
  const prevTabIdx = useRef(tabIdx);
  const tabDir = tabIdx > prevTabIdx.current ? 1 : tabIdx < prevTabIdx.current ? -1 : 0;
  useEffect(() => { prevTabIdx.current = tabIdx; }, [tabIdx]);
  useEffect(() => { setLastPay((l) => nextLastPayTab(tab, l)); }, [tab, setLastPay]);

  const summary = summaryVariant(tab);

  const goTo = (t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  const switchMode = (m: Mode) => goTo(m === 'pay' ? lastPay : m);

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
    <div className="app-bg min-h-screen bg-page text-slate-900">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-surface px-3 py-4 lg:flex">
        <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-2.5 py-2">
          <Logo />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-slate-900">Salary & OT</div>
            <div className="truncate text-xs text-slate-500">Payroll estimator</div>
          </div>
        </div>

        <SectionLabel className="mt-6 mb-2 px-2.5">Pay</SectionLabel>
        <nav aria-label="Pay sections" className="relative">
          {/* Sliding active indicator: outlined box with a thin left accent bar. Hidden off the pay tabs. */}
          <span
            aria-hidden
            className={`absolute inset-x-0 top-0 h-10 overflow-hidden rounded-lg border border-slate-200 bg-surface shadow-[var(--shadow-card)] transition-[transform,opacity] duration-250 ease-out ${payIdx >= 0 ? 'opacity-100' : 'opacity-0'}`}
            style={{ transform: `translateY(${Math.max(payIdx, 0) * NAV_ROW}px)` }}
          >
            <span className="absolute inset-y-0 left-0 w-[3px] bg-ink" />
          </span>
          <ul className="relative flex flex-col gap-1">
            {PAY_ITEMS.map((t) => {
              const active = tab === t.id;
              const Icon = t.icon;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => goTo(t.id)}
                    className={`flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors duration-200 ${
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
          <button
            type="button"
            onClick={() => goTo('car')}
            aria-current={mode === 'car' ? 'page' : undefined}
            className={`mt-2 flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors duration-200 ${
              mode === 'car' ? 'text-accent' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Car {...ICON} aria-hidden />
            Car
          </button>
          <button
            type="button"
            onClick={() => goTo('tax')}
            aria-current={mode === 'tax' ? 'page' : undefined}
            className={`mt-1 flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors duration-200 ${
              mode === 'tax' ? 'text-accent' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Landmark {...ICON} aria-hidden />
            Tax
          </button>
        </nav>

        <p className="mt-auto rounded-lg border border-slate-200 p-3 text-[11px] leading-snug text-slate-400">
          Pay = hours × hourly rate × multiplier. Hourly = 12 × basic ÷ (52 × weekly hours).
        </p>
      </aside>

      <div className="lg:pl-60">
        {/* Top bar: short title on phones, view title on desktop. Pay | Car switch, eye, theme, settings gear. */}
        <header className="border-b border-slate-200 bg-surface">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2 sm:gap-2.5 sm:px-6 lg:h-16 lg:gap-3 lg:py-0">
            <div className="min-w-0 flex-1">
              <h1 id="view-title" className="truncate text-[15px] font-semibold text-slate-900 lg:text-lg">
                <span className="lg:hidden">OT Calc</span>
                <span className="hidden lg:inline">{current.label}</span>
              </h1>
              <p className="hidden truncate text-[13px] text-slate-500 sm:block">{current.blurb}</p>
            </div>
            <PayCarSwitch mode={mode} onChange={switchMode} />
            <div className="flex shrink-0 items-center">
              <PrivacyToggle hidden={hidePay} onToggle={() => setHidePay((h) => !h)} />
              <ThemeToggle pref={theme.pref} onCycle={theme.cyclePref} />
              <button
                type="button"
                onClick={() => goTo('settings')}
                aria-label="Settings"
                aria-current={tab === 'settings' ? 'page' : undefined}
                title="Settings"
                className={`${HEADER_BTN} ${tab === 'settings' ? 'bg-accent-bg text-accent' : 'text-slate-500'}`}
              >
                <Settings size={18} strokeWidth={1.5} aria-hidden />
              </button>
            </div>
          </div>
        </header>

        {/* Pinned summary. Calculator: full grid that collapses on scroll. Breakdown/Target/Months: one-line strip. Settings/Car: none. */}
        {/* A labelled region, so the pinned figures sit inside a landmark (axe: region). */}
        {summary === 'full' && (
          <section aria-label="Pay summary" className="sticky top-0 z-20 border-b border-slate-200 bg-surface/90 backdrop-blur-md">
            <div className={`mx-auto max-w-6xl px-3 transition-[padding] duration-200 sm:px-6 ${compact ? 'py-1.5' : 'py-2 sm:py-4'}`}>
              <SummaryCards result={result} hidden={hidePay} compact={compact} periodLabel={periodLabel} />
            </div>
          </section>
        )}
        {summary === 'strip' && (
          <div className="sticky top-0 z-20 border-b border-slate-200 bg-surface/90 backdrop-blur-md">
            <div className="mx-auto max-w-6xl px-3 sm:px-6">
              <SummaryStrip
                result={result}
                hidden={hidePay}
                periodLabel={periodLabel}
                expanded={summaryOpen}
                onToggle={() => setSummaryOpen((o) => !o)}
              />
            </div>
          </div>
        )}

        {/* overflow-x-clip: the tab-in animation slides up to 18px sideways, past the 12px gutter. */}
        <main
          id="panel"
          aria-labelledby="view-title"
          className={`mx-auto max-w-6xl overflow-x-clip px-3 pt-4 sm:px-6 sm:pt-6 ${mode === 'pay' ? 'pb-28 lg:pb-10' : 'pb-10'}`}
        >
          <div key={tab} className="anim-tab space-y-4" style={{ '--dir': tabDir } as CSSProperties}>
            {summary === 'strip' && summaryOpen && (
              <SummaryCards result={result} hidden={hidePay} compact={false} periodLabel={periodLabel} />
            )}

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
                  result={result}
                  hidden={hidePay}
                />
                <div className="min-w-0 space-y-4">
                  {cycle && <CycleInfo cycle={cycle} />}
                  <button type="button" onClick={() => goTo('breakdown')} className={`${btnOutline} min-h-11 w-full py-2.5`}>
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

            {tab === 'months' && (
              <MonthsTab
                form={form}
                config={config}
                calc={calc}
                hidden={hidePay}
                onLoadMonth={(f) => {
                  setForm(f);
                  goTo('calculator');
                }}
                onSetTarget={(net) => {
                  update({ targetNet: String(net) });
                  goTo('target');
                }}
                onImportConfig={(raw) => {
                  setConfig(migrateConfig(raw));
                  setSettingsKey((k) => k + 1);
                }}
              />
            )}

            {tab === 'settings' && (
              <div className="max-w-4xl space-y-4">
                <AppearanceCard theme={theme.pref} onThemeChange={theme.setPref} />
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

            {tab === 'car' && <CarCalculator otNet={result.net} />}
            {tab === 'tax' && <TaxTab />}

            {tab !== 'car' && tab !== 'tax' && (
              <p className="pt-2 text-center text-xs text-slate-400">
                Estimates only. Unpaid leave and age-based CPF rate changes are not modelled automatically.
              </p>
            )}
          </div>
        </main>
      </div>

      {/* Pay mode only: four tabs. Settings (header gear) and Car (own mode) have no bar tab. */}
      {mode === 'pay' && (
        <BottomBar items={PAY_ITEMS} active={isBarTab(tab) ? tab : null} onSelect={goTo} />
      )}
    </div>
  );
}
