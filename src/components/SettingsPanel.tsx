import { useState } from 'react';
import type { Deduction, PayrollConfig } from '../types/payroll';
import { parseNonNegative } from '../utils/validation';
import { RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { btnGhost, btnOutline, Card, Field, inputClass, NumInput } from './ui';

/**
 * Number field for settings: keeps the raw string locally so the user can
 * type freely, and only commits valid values upward. Remount (via `key`)
 * to resync after a reset.
 */
function SettingNumber({ label, value, onCommit, suffix, hint, integer }: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  suffix?: string;
  hint?: string;
  integer?: boolean;
}) {
  const [raw, setRaw] = useState(String(value));
  const [error, setError] = useState<string>();
  return (
    <Field label={label} error={error} hint={hint}>
      <NumInput
        value={raw}
        suffix={suffix}
        error={error}
        onChange={(v) => {
          setRaw(v);
          const p = parseNonNegative(v, label, { integer });
          if (v.trim() === '') setError(`${label} is required.`);
          else if (p.error) setError(p.error);
          else {
            setError(undefined);
            onCommit(p.value);
          }
        }}
      />
    </Field>
  );
}

interface Props {
  config: PayrollConfig;
  onChange: (c: PayrollConfig) => void;
  onReset: () => void;
}

export function SettingsPanel({ config, onChange, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const { rules, cpf } = config;

  const setRules = (patch: Partial<PayrollConfig['rules']>) => onChange({ ...config, rules: { ...rules, ...patch } });
  const setCpf = (patch: Partial<PayrollConfig['cpf']>) => onChange({ ...config, cpf: { ...cpf, ...patch } });
  const setDeduction = (id: string, patch: Partial<Deduction>) =>
    onChange({ ...config, defaultDeductions: config.defaultDeductions.map((d) => (d.id === id ? { ...d, ...patch } : d)) });

  const section = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4';
  const heading = 'mb-2.5 mt-6 border-t border-slate-100 pt-4 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400 first:mt-0 first:border-0 first:pt-0';

  return (
    <Card
      title="Settings — pay rules"
      subtitle="Edit when payroll rules change. Saved in this browser."
      actions={
        <div className="flex gap-2">
          {open && (
            <button type="button" onClick={onReset} className={`${btnGhost} text-bad hover:bg-bad-bg hover:text-bad`}>
              <RotateCcw size={14} strokeWidth={1.75} aria-hidden /> Reset defaults
            </button>
          )}
          <button type="button" onClick={() => setOpen(!open)} className={btnOutline}>
            <SlidersHorizontal size={14} strokeWidth={1.75} aria-hidden /> {open ? 'Hide' : 'Edit rules'}
          </button>
        </div>
      }
    >
      {open && (
        <div className="anim-tab">
          <h3 className={heading}>Salary & allowances</h3>
          <div className={section}>
            <SettingNumber label="Basic salary" value={rules.basicSalary} onCommit={(basicSalary) => setRules({ basicSalary })} />
            <SettingNumber label="Transport allowance" value={rules.transportAllowance} onCommit={(transportAllowance) => setRules({ transportAllowance })} />
            <SettingNumber label="Shift allowance per shift" value={rules.shiftAllowancePerShift} onCommit={(shiftAllowancePerShift) => setRules({ shiftAllowancePerShift })} hint="Every shift, weekend OT included" />
          </div>

          <h3 className={heading}>Overtime</h3>
          <div className={section}>
            <SettingNumber label="Weekday OT ×" value={rules.weekdayOtMultiplier} onCommit={(weekdayOtMultiplier) => setRules({ weekdayOtMultiplier })} />
            <SettingNumber label="Saturday ×" value={rules.saturdayMultiplier} onCommit={(saturdayMultiplier) => setRules({ saturdayMultiplier })} />
            <SettingNumber label="Sunday / PH ×" value={rules.sundayMultiplier} onCommit={(sundayMultiplier) => setRules({ sundayMultiplier })} hint="Public holidays pay the same" />
            <SettingNumber label="Full shift hours" value={rules.fullShiftHours} onCommit={(fullShiftHours) => setRules({ fullShiftHours })} suffix="hrs" />
            <SettingNumber label="OT hours (short)" value={rules.weekdayOtHoursPerDay} onCommit={(weekdayOtHoursPerDay) => setRules({ weekdayOtHoursPerDay })} suffix="hrs" hint="2nd weekday tap" />
            <SettingNumber label="OT hours (long)" value={rules.weekdayOtHoursLong} onCommit={(weekdayOtHoursLong) => setRules({ weekdayOtHoursLong })} suffix="hrs" hint="3rd weekday tap" />
            <SettingNumber label="Weekly hours" value={rules.weeklyHours} onCommit={(weeklyHours) => setRules({ weeklyHours })} hint="Hourly = 12×basic ÷ (52×this)" />
            <SettingNumber integer label="Normal shifts for target" value={rules.targetNormalShifts} onCommit={(targetNormalShifts) => setRules({ targetNormalShifts })} suffix="shifts" hint="Target base, no OT / PH" />
          </div>

          <h3 className={heading}>CPF</h3>
          <div className={section}>
            <SettingNumber label="Employee rate" value={+(cpf.employeeRate * 100).toFixed(4)} onCommit={(n) => setCpf({ employeeRate: n / 100 })} suffix="%" />
            <SettingNumber label="OW ceiling" value={cpf.owCeiling} onCommit={(owCeiling) => setCpf({ owCeiling })} />
          </div>

          <h3 className={heading}>Fixed deductions</h3>
          <div className="space-y-2">
            {config.defaultDeductions.map((d) => (
              <div key={d.id} className="flex gap-2">
                <input value={d.label} onChange={(e) => setDeduction(d.id, { label: e.target.value })} className={`${inputClass()} flex-1`} aria-label="Deduction name" />
                <div className="w-32">
                  <SettingNumber label="" value={d.amount} onCommit={(amount) => setDeduction(d.id, { amount })} />
                </div>
                <button
                  type="button"
                  aria-label="Remove"
                  onClick={() => onChange({ ...config, defaultDeductions: config.defaultDeductions.filter((x) => x.id !== d.id) })}
                  className="self-start rounded-lg px-2 py-2 text-slate-400 transition hover:bg-bad-bg hover:text-bad active:scale-95"
                >
                  <X size={16} strokeWidth={1.5} aria-hidden />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onChange({ ...config, defaultDeductions: [...config.defaultDeductions, { id: crypto.randomUUID(), label: 'New deduction', amount: 0 }] })}
              className="rounded-lg px-2 py-1 text-[13px] font-medium text-slate-900 transition hover:bg-slate-100 active:scale-[0.97]"
            >
              + Add fixed deduction
            </button>
          </div>

          <h3 className={heading}>Pay cycle</h3>
          <div className={section}>
            <SettingNumber integer label="OT cycle start day" value={config.otCycleStartDay} onCommit={(n) => onChange({ ...config, otCycleStartDay: Math.min(31, Math.max(1, n)) })} hint="of previous month" />
            <SettingNumber integer label="OT cycle end day" value={config.otCycleEndDay} onCommit={(n) => onChange({ ...config, otCycleEndDay: Math.min(31, Math.max(1, n)) })} hint="of payout month" />
            <SettingNumber integer label="Pay day" value={config.payDay} onCommit={(n) => onChange({ ...config, payDay: Math.min(31, Math.max(1, n)) })} />
          </div>
        </div>
      )}
    </Card>
  );
}
