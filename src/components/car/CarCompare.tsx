import type { ReactNode } from 'react';
import type { CarForm } from '../../utils/car';
import { formatCoeLeft } from '../../utils/coe';
import { savedCarFigures, showFullLoanRow, type SavedCarFigures } from '../../utils/carSaved';
import { money, moneyWhole, num } from '../../utils/format';
import type { SavedCar } from '../../utils/savedCars';

interface Props {
  cars: SavedCar[];
  form: CarForm;
}

const NONE = '—';

/** Side-by-side table for 2–3 saved cars. Scrolls sideways inside its container on phones. */
export function CarCompare({ cars, form }: Props) {
  const today = new Date();
  const figs: SavedCarFigures[] = cars.map((c) => savedCarFigures(c, form, today));
  // Shared across columns: the table reads the same downpayment for every car.
  const downPct = figs[0]?.downPct ?? 0;

  const allRows: { id: string; label: string; cell: (c: SavedCar, f: SavedCarFigures) => ReactNode }[] = [
    { id: 'price', label: 'Price', cell: (c) => (c.price === undefined ? NONE : moneyWhole(c.price)) },
    { id: 'omv', label: 'OMV', cell: (c) => (c.omv === undefined ? NONE : moneyWhole(c.omv)) },
    { id: 'arf', label: 'ARF', cell: (c) => (c.arf === undefined ? NONE : moneyWhole(c.arf)) },
    { id: 'coe', label: 'COE', cell: (c) => (c.coe === undefined ? NONE : moneyWhole(c.coe)) },
    { id: 'year', label: 'Year', cell: (c) => (c.year === undefined ? NONE : String(c.year)) },
    { id: 'mileage', label: 'Mileage', cell: (c) => (c.mileage === undefined ? NONE : `${num(c.mileage, 0)} km`) },
    {
      id: 'coeLeft',
      label: 'COE left',
      cell: (_c, f) =>
        f.coeLeft === null ? (
          NONE
        ) : (
          <>
            {formatCoeLeft(f.coeLeft)}
            {f.tenureCapped && <span className="block text-[11px] font-normal text-sat">loan capped to COE</span>}
          </>
        ),
    },
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
      label: `Monthly (${downPct}% down)`,
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
    { id: 'interest', label: `Interest (${downPct}% down)`, cell: (_c, f) => (f.interest === null ? NONE : money(f.interest)) },
    { id: 'full', label: 'Monthly (0% down)', cell: (_c, f) => (f.monthlyFullLoan === null ? NONE : money(f.monthlyFullLoan)) },
  ];
  // At 0% down the "0% down" row would repeat the current-downpayment row above it.
  const rows = allRows.filter((r) => r.id !== 'full' || showFullLoanRow(downPct));

  // Widths are sized so two cars fit a 390px phone without scrolling. Three cars scroll sideways.
  return (
    <>
      {/* Focusable so keyboard users can scroll the table sideways (axe: scrollable-region-focusable). */}
      <div
        role="region"
        aria-label="Saved cars comparison"
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)"
      >
        <table className="w-full table-fixed border-collapse text-left text-[13px] tabular-nums">
          <caption className="sr-only">
            Side-by-side comparison of the selected saved cars at the current downpayment and tenure
          </caption>
          <colgroup>
            <col className="w-[7rem]" />
            {cars.map((c) => (
              <col key={c.id} className="w-[6.5rem]" />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-500">
              <th scope="col" className="sticky left-0 z-10 bg-slate-50 px-2 py-2 font-medium">
                Figure
              </th>
              {cars.map((c) => (
                <th key={c.id} scope="col" className="break-words px-2 py-2 font-semibold text-slate-900">
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-200">
                <th scope="row" className="sticky left-0 z-10 bg-surface px-2 py-2 text-left align-top font-medium break-words text-slate-700">
                  {r.label}
                </th>
                {cars.map((c, i) => (
                  <td key={c.id} className="break-words px-2 py-2 align-top font-semibold text-slate-900">
                    {r.cell(c, figs[i])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cars.length > 2 && (
        <p className="mt-1 text-xs text-slate-500 sm:hidden" aria-hidden>
          Swipe sideways for more →
        </p>
      )}
    </>
  );
}
