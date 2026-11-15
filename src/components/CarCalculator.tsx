import { useMemo, useState } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { computeCar, type CarForm, DEFAULT_CAR_FORM, migrateCarForm } from '../utils/car';
import { draftFromListing, importPatch, type ImportDraft, type ImportedListing } from '../utils/carImport';
import { SavedCars } from './car/SavedCars';
import { SgcarmartImport } from './car/SgcarmartImport';
import { CarInputs } from './CarInputs';
import { CarResults } from './CarResults';

interface Props {
  /** Monthly net pay from the OT calculator (enables the "Use OT net pay" shortcut). */
  otNet?: number;
}

/**
 * Car financing tab: import and inputs on the left (stacked on phones), dashboard on the right,
 * saved cars and comparison full width below.
 */
export function CarCalculator({ otNet }: Props) {
  const [form, setForm] = useLocalStorage<CarForm>('carcalc.inputs.v1', DEFAULT_CAR_FORM, migrateCarForm);
  // Last successful import: its link and figures are saved with the car if the user saves it.
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const result = useMemo(() => computeCar(form), [form]);
  const update = (patch: Partial<CarForm>) => setForm((f) => ({ ...f, ...patch }));

  const onImported = (listing: ImportedListing) => {
    update(importPatch(listing.fields));
    setDraft(draftFromListing(listing));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          <SgcarmartImport onImported={onImported} />
          <CarInputs form={form} update={update} result={result} otNet={otNet} onReset={() => setForm(DEFAULT_CAR_FORM)} />
        </div>
        <CarResults result={result} />
      </div>
      <SavedCars form={form} update={update} draft={draft} />
    </div>
  );
}
