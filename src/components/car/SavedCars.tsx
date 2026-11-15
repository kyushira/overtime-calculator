import { useEffect, useState, type FormEvent } from 'react';
import { ExternalLink, Trash2 } from 'lucide-react';
import type { CarForm } from '../../utils/car';
import { parseNum } from '../../utils/car';
import type { ImportDraft } from '../../utils/carImport';
import { currentDownPct, loadPatch, savedCarFigures } from '../../utils/carSaved';
import { money, moneyWhole } from '../../utils/format';
import { round2 } from '../../utils/payroll';
import { MAX_SAVED_CARS, addCar, loadCars, removeCar, saveCars, type SavedCar } from '../../utils/savedCars';
import { btnPrimary, Card, Field, inputClass } from '../ui';
import { CarCompare } from './CarCompare';

interface Props {
  form: CarForm;
  update: (patch: Partial<CarForm>) => void;
  /** Details from the last successful import, if any: its link and figures are saved with the car. */
  draft: ImportDraft | null;
}

const MAX_COMPARE = 3;
const NONE = '—';
const UNDO_MS = 8000;

/** Saved cars: save the current price/OMV, load one back, open its listing, delete (undoable), compare. */
export function SavedCars({ form, update, draft }: Props) {
  const [cars, setCars] = useState<SavedCar[]>(() => loadCars());
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [removed, setRemoved] = useState<{ car: SavedCar; index: number } | null>(null);

  // The undo window closes on its own after a few seconds.
  useEffect(() => {
    if (!removed) return;
    const t = setTimeout(() => setRemoved(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [removed]);

  const price = parseNum(form.price);
  const effectiveName = name.trim() || draft?.name?.trim() || '';
  const canSave = effectiveName !== '' && price > 0;
  // Only the cars that still exist: a deleted car drops out of the selection on its own.
  const selectedCars = cars.filter((c) => selected.includes(c.id));

  /** Writes the list. Storage can be unavailable (private mode, full): the session still works. */
  function commit(next: SavedCar[]): boolean {
    setCars(next);
    return saveCars(next);
  }

  function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSave) return;
    if (cars.length >= MAX_SAVED_CARS) {
      setMessage(`The list is full (${MAX_SAVED_CARS} cars). Delete one to save another.`);
      return;
    }
    const omv = form.omv.trim() === '' ? undefined : parseNum(form.omv);
    const input = {
      name: effectiveName,
      price,
      downPct: round2(currentDownPct(form)),
      ...(omv !== undefined ? { omv } : {}),
      ...(draft?.link !== undefined ? { link: draft.link } : {}),
      ...(draft?.arf !== undefined ? { arf: draft.arf } : {}),
      ...(draft?.coe !== undefined ? { coe: draft.coe } : {}),
      ...(draft?.year !== undefined ? { year: draft.year } : {}),
      ...(draft?.mileage !== undefined ? { mileage: draft.mileage } : {}),
    };
    const next = addCar(cars, input);
    if (next === cars) {
      setMessage(`${effectiveName} is already saved (same listing link).`);
      return;
    }
    const persisted = commit(next);
    setName('');
    setMessage(
      persisted
        ? `Saved ${effectiveName}.`
        : `Saved ${effectiveName} for this session only: browser storage could not be written (unavailable, full, or holding newer saved-car data).`,
    );
  }

  function onLoad(car: SavedCar) {
    const patch = loadPatch(car);
    if (!patch) return;
    update(patch);
    setMessage(`Loaded ${car.name} into the calculator.`);
  }

  function onDelete(car: SavedCar) {
    const index = cars.findIndex((c) => c.id === car.id);
    commit(removeCar(cars, car.id));
    setRemoved({ car, index });
    setMessage(`Deleted ${car.name}.`);
  }

  function onUndo() {
    if (!removed) return;
    const { car, index } = removed;
    if (!cars.some((c) => c.id === car.id)) {
      const at = Math.min(index, cars.length);
      commit([...cars.slice(0, at), car, ...cars.slice(at)]);
      setMessage(`Restored ${car.name}.`);
    }
    setRemoved(null);
  }

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < MAX_COMPARE ? [...s, id] : s));
  }

  const downPctText = round2(currentDownPct(form));

  return (
    <Card title="Saved cars" subtitle="Save cars you are considering and compare them side by side.">
      <form onSubmit={onSave} className="space-y-3">
        <Field label="Car name" hint={draft?.link ? 'The imported listing link is saved with this car.' : undefined}>
          <input
            type="text"
            value={name}
            maxLength={200}
            placeholder={draft?.name ?? 'e.g. Honda Vezel 1.5X'}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            className={inputClass()}
          />
        </Field>
        <p className="text-xs text-slate-500">
          Saves the price and OMV on the calculator now ({moneyWhole(price)}).
        </p>
        <button type="submit" disabled={!canSave} className={`${btnPrimary} min-h-11 w-full`}>
          Save car
        </button>
        {!canSave && (
          <p className="text-xs text-slate-500">
            {effectiveName === '' ? 'Type a name to save.' : 'Enter a car price to save.'}
          </p>
        )}
      </form>

      {/* Single live region for save, load, delete and undo feedback. */}
      <div role="status" aria-live="polite" className="mt-3 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-600">
        <span>{message}</span>
        {removed && (
          <button
            type="button"
            onClick={onUndo}
            className="min-h-11 rounded-lg px-2 font-semibold text-accent hover:bg-slate-100"
          >
            Undo
          </button>
        )}
      </div>

      {cars.length === 0 ? (
        <p className="mt-2 rounded-lg bg-slate-100 px-3 py-3 text-[13px] text-slate-600">
          No saved cars yet. Import a listing or enter a price, then save it here.
        </p>
      ) : (
        <>
          <p className="mt-3 text-xs text-slate-500">
            Monthly figures use the calculator&apos;s tenure and rate at the {downPctText}% downpayment set now. Tap a car to load its price and OMV.
          </p>
          <ul className="mt-2">
            {cars.map((car) => {
              const figs = savedCarFigures(car, form);
              const isSelected = selected.includes(car.id);
              const loadable = car.price !== undefined && car.price > 0;
              const atLimit = selected.length >= MAX_COMPARE && !isSelected;
              return (
                <li key={car.id} className="flex items-center gap-1 border-t border-slate-200 py-1 first:border-t-0">
                  <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={atLimit}
                      onChange={() => toggle(car.id)}
                      aria-label={`Compare ${car.name}`}
                      className="size-5 accent-accent disabled:cursor-not-allowed"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => onLoad(car)}
                    disabled={!loadable}
                    className="min-h-11 min-w-0 flex-1 rounded-lg px-2 py-1 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="block truncate text-sm font-semibold text-slate-900">{car.name}</span>
                    <span className="block truncate text-xs tabular-nums text-slate-500">
                      {loadable ? (
                        <>
                          {moneyWhole(car.price!)} · {figs.monthly !== null ? money(figs.monthly) : NONE} a month at{' '}
                          {figs.downPct}% down
                          {car.downPct !== undefined && Math.abs(car.downPct - figs.downPct) > 0.01
                            ? ` (saved at ${car.downPct}%)`
                            : ''}
                        </>
                      ) : (
                        'No price saved'
                      )}
                    </span>
                  </button>
                  {car.link && (
                    <a
                      href={car.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${car.name} listing in a new tab`}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-accent transition-colors hover:bg-slate-100"
                    >
                      <ExternalLink size={18} strokeWidth={1.5} aria-hidden />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete(car)}
                    aria-label={`Delete ${car.name}`}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-bad transition-colors hover:bg-bad-bg"
                  >
                    <Trash2 size={18} strokeWidth={1.5} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
            <h3 className="text-[13px] font-semibold text-slate-900">Compare</h3>
            {selectedCars.length >= 2 ? (
              <>
                <CarCompare cars={selectedCars} form={form} />
                <p className="text-xs text-slate-500">Up to {MAX_COMPARE} cars.</p>
              </>
            ) : (
              <p className="text-[13px] text-slate-500">Tick two or three saved cars above to compare them.</p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
