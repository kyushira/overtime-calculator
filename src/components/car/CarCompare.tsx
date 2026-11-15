import type { ReactNode } from 'react';
import type { CarForm } from '../../utils/car';
import { savedCarFigures, type SavedCarFigures } from '../../utils/carSaved';
import { money, moneyWhole, num } from '../../utils/format';
import type { SavedCar } from '../../utils/savedCars';

interface Props {
  cars: SavedCar[];
  form: CarForm;
}

const NONE = '—';

/** Side-by-side table for 2–3 saved cars. Scrolls sideways inside its container on phones. */
export function CarCompare({ cars, form }: Props) {
  const figs: SavedCarFigures[] = cars.map((c) => savedCarFigures(c, form));
  // Shared across columns: the table reads the same downpayment for every car.
  const downPct = figs[0]?.downPct ?? 0;

  const rows: { id: string; label: string; cell: (c: SavedCar, f: SavedCarFigures) => ReactNode }[] = [
    { id: 'price', label: 'Price', cell: (c) => (c.price === undefined ? NONE : moneyWhole(c.price)) },
    { id: 'omv', label: 'OMV', cell: (c) => (c.omv === undefined ? NONE : moneyWhole(c.omv)) },
    { id: 'arf', label: 'ARF', cell: (c) => (c.arf === undefined ? NONE : moneyWhole(c.arf)) },
    { id: 'coe', label: 'COE', cell: (c) => (c.coe === undefined ? NONE : moneyWhole(c.coe)) },
    { id: 'year', label: 'Year', cell: (c) => (c.year === undefined ? NONE : String(c.year)) },
    { id: 'mileage', label: 'Mileage', cell: (c) => (c.mileage === undefined ? NONE : `${num(c.mileage, 0)} km`) },
    {
      id: 'mas',
      label: 'MAS minimum down',
      cell: (c, f) => (
        <>
          {f.masMinPct}%{c.omv === undefined && <span className="block text-[11px] font-normal text-slate-500">no OMV saved</span>}
        </>
      ),
    },
    {
      id: 'monthly',
      label: `Monthly at ${downPct}% down`,
      cell: (_c, f) =>
        f.monthly === null ? (
          NONE
        ) : (
          <>
            {money(f.monthly)}
            {f.belowMas && <span className="block text-[11px] font-normal text-sat">below MAS minimum</span>}
          </>
        ),
    },
    { id: 'interest', label: `Total interest at ${downPct}% down`, cell: (_c, f) => (f.interest === null ? NONE : money(f.interest)) },
    { id: 'full', label: 'Monthly at full loan (0% down)', cell: (_c, f) => (f.monthlyFullLoan === null ? NONE : money(f.monthlyFullLoan)) },
  ];

  return (
    // Focusable so keyboard users can scroll the table sideways (axe: scrollable-region-focusable).
    <div
      role="region"
      aria-label="Saved cars comparison"
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)"
    >
      <table className="w-full min-w-[30rem] border-collapse text-left text-[13px] tabular-nums">
        <caption className="sr-only">
          Side-by-side comparison of the selected saved cars at the current downpayment and tenure
        </caption>
        <thead>
          <tr className="bg-slate-50 text-xs text-slate-500">
            <th scope="col" className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-medium">
              Figure
            </th>
            {cars.map((c) => (
              <th key={c.id} scope="col" className="min-w-[8.5rem] px-3 py-2 font-semibold text-slate-900">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-200">
              <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left align-top font-medium text-slate-700">
                {r.label}
              </th>
              {cars.map((c, i) => (
                <td key={c.id} className="px-3 py-2 align-top font-semibold text-slate-900">
                  {r.cell(c, figs[i])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
