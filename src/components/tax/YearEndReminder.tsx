import { money } from '../../utils/format';
import { Card } from '../ui';
import type { TaxReminder } from './taxModel';

interface Props {
  reminders: TaxReminder[];
}

/** Reliefs that still have room under their cap, in the order the model gives. */
export function YearEndReminder({ reminders }: Props) {
  return (
    <Card
      index={3}
      title="Year-end reminder"
      subtitle="Reliefs you qualify for that still have room under their cap."
    >
      {reminders.length === 0 ? (
        <p role="status" className="text-sm text-slate-500">
          No unclaimed room left in the reliefs you qualify for.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {reminders.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5">
              <span className="min-w-0 text-sm font-medium text-slate-900">{r.label}</span>
              <span className="text-xs tabular-nums text-slate-500">
                room {money(r.room)} · could cut tax by <span className="font-medium text-good">{money(r.extraSaving)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
