import { money } from '../../utils/format';
import { Card } from '../ui';
import { percent, percentOneDp } from './fields';
import type { TaxView } from './taxModel';

interface Props {
  view: TaxView;
  ya: number;
}

/** One label/value line of the results list. */
function Line({ label, value, hint, strong = false }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className="min-w-0 text-sm text-slate-600">
        {label}
        {hint && <span className="block text-xs text-slate-400">{hint}</span>}
      </dt>
      <dd className={`shrink-0 tabular-nums ${strong ? 'text-base font-semibold text-slate-900' : 'text-sm text-slate-900'}`}>
        {value}
      </dd>
    </div>
  );
}

/** Results: income after reliefs, tax, rebate and rates. Every figure comes from the view. */
export function TaxResultsCard({ view, ya }: Props) {
  const { result } = view;
  return (
    <Card index={2} title="Results" subtitle={`Estimate for YA${ya}`}>
      <dl className="divide-y divide-slate-200">
        <Line label="Chargeable income" value={money(result.chargeableIncome)} />
        <Line label="Tax before rebate" value={money(result.taxOnChargeable)} />
        {result.rebate > 0 && <Line label="Personal income tax rebate" value={money(-result.rebate)} />}
        <Line label="Tax payable" value={money(result.netTaxPayable)} strong />
        <Line label="Effective rate" value={percentOneDp(view.effectiveRate)} />
        <Line label="Marginal rate" value={percent(result.marginalRate)} />
        <Line
          label="Estimated tax savings"
          hint="vs. no reliefs, before rebate"
          value={money(result.estimatedSavings)}
        />
      </dl>
    </Card>
  );
}
