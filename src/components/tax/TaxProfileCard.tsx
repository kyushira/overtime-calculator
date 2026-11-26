import { incomeYearForYa, type Residency, type YA } from '../../tax';
import { Card, Field, inputClass, NumInput, Segmented } from '../ui';
import { numText, parseNumber } from './fields';
import type { TaxState } from './taxModel';

interface Props {
  state: TaxState;
  setProfile: (patch: Partial<TaxState>) => void;
}

const RESIDENCY_OPTIONS: { value: Residency; label: string }[] = [
  { value: 'citizenOrPr', label: 'Citizen / PR' },
  { value: 'foreigner', label: 'Foreigner' },
];

const YA_OPTIONS: YA[] = [2025, 2026];

/** Income profile: year of assessment, income, age and residency. */
export function TaxProfileCard({ state, setProfile }: Props) {
  return (
    <Card index={0} title="Income profile" subtitle="The figures every relief is based on.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Year of Assessment"
          hint={`Income earned in ${incomeYearForYa(state.ya)}.`}
          className="sm:col-span-2"
        >
          <select
            value={state.ya}
            onChange={(e) => setProfile({ ya: Number(e.target.value) as YA })}
            className={`${inputClass()} appearance-none`}
          >
            {YA_OPTIONS.map((ya) => (
              <option key={ya} value={ya}>
                YA{ya}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Employment income" className="min-w-0">
          <NumInput
            value={numText(state.employmentIncome)}
            prefix="S$"
            ariaLabel="Employment income in S$"
            onChange={(v) => setProfile({ employmentIncome: parseNumber(v) ?? 0 })}
          />
        </Field>

        <Field label="Bonus" className="min-w-0">
          <NumInput
            value={numText(state.bonus)}
            prefix="S$"
            ariaLabel="Bonus in S$"
            onChange={(v) => setProfile({ bonus: parseNumber(v) ?? 0 })}
          />
        </Field>

        <Field label="Age" hint="Age on 31 Dec of the income year." className="min-w-0">
          <NumInput
            value={String(state.age)}
            ariaLabel="Age on 31 December of the income year"
            step="1"
            onChange={(v) => {
              const n = parseNumber(v);
              if (n !== null) setProfile({ age: Math.floor(n) });
            }}
          />
        </Field>

        <div className="min-w-0">
          <span className="mb-1.5 block text-[13px] font-medium text-slate-700">Residency</span>
          <Segmented
            ariaLabel="Residency"
            value={state.residency}
            options={RESIDENCY_OPTIONS}
            onChange={(residency) => setProfile({ residency })}
          />
        </div>
      </div>
    </Card>
  );
}
