import type { PayCycle } from '../types/payroll';
import { formatDate } from '../utils/cycle';
import { MONTHS } from '../utils/format';
import { Card, SectionLabel } from './ui';

export function CycleInfo({ cycle }: { cycle: PayCycle }) {
  const items = [
    { label: 'Salary period', value: `${formatDate(cycle.salaryStart, false)} – ${formatDate(cycle.salaryEnd)}` },
    { label: 'OT period', value: `${formatDate(cycle.otStart)} – ${formatDate(cycle.otEnd)}` },
    { label: 'Pay day', value: formatDate(cycle.payDate) },
  ];
  return (
    <Card title={`${MONTHS[cycle.month - 1]} ${cycle.year} payout cycle`} index={1}>
      <dl className="grid gap-3 sm:grid-cols-3">
        {items.map((i) => (
          <div key={i.label} className="rounded-lg bg-slate-100 p-3">
            <dt><SectionLabel>{i.label}</SectionLabel></dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{i.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-slate-500">
        OT cycle has <strong className="font-semibold text-slate-700">{cycle.sundays}</strong> Sundays, <strong className="font-semibold text-slate-700">{cycle.saturdays}</strong> Saturdays and{' '}
        <strong className="font-semibold text-slate-700">{cycle.weekdays}</strong> weekdays (public holidays not excluded).
      </p>
    </Card>
  );
}
