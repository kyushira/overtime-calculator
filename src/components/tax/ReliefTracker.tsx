import type { ReliefId } from '../../tax';
import { money, moneyWhole } from '../../utils/format';
import { Card } from '../ui';
import { percent } from './fields';
import { ReliefRow } from './ReliefRow';
import type { EntryState, TaxView } from './taxModel';

interface Props {
  view: TaxView;
  ya: number;
  setEntry: (id: ReliefId, patch: Partial<EntryState>) => void;
}

/** Relief tracker: running total against the overall cap, then one row per relief. */
export function ReliefTracker({ view, ya, setEntry }: Props) {
  return (
    <Card
      index={1}
      title="Relief tracker"
      subtitle="Tick what you qualify for and enter what you paid or gave. Each relief has its own cap."
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
          <span className="font-medium text-slate-700">Total claimed</span>
          <span className="tabular-nums text-slate-900">
            {money(view.totalClaimed)} <span className="text-slate-500">of {moneyWhole(view.overallCap)}</span>
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Total reliefs claimed"
          aria-valuemin={0}
          aria-valuemax={view.overallCap}
          aria-valuenow={view.totalClaimed}
          aria-valuetext={`${money(view.totalClaimed)} of ${moneyWhole(view.overallCap)}`}
          className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-300 ease-out ${view.capReached ? 'bg-sat' : 'bg-ink'}`}
            style={{ width: percent(view.totalShare) }}
          />
        </div>
        {view.capReached && (
          <div role="status" className="rounded-lg border border-sat/40 bg-sat-bg p-3 text-sm text-sat">
            Reliefs are capped at {moneyWhole(view.overallCap)} overall. Further claims won&rsquo;t reduce tax.
          </div>
        )}
      </div>

      <ul className="mt-4 divide-y divide-slate-200">
        {view.rows.map((row) => (
          <ReliefRow key={row.id} row={row} ya={ya} setEntry={setEntry} />
        ))}
      </ul>
    </Card>
  );
}
