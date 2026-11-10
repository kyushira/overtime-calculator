import { useMemo } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { computeCar, type CarForm, DEFAULT_CAR_FORM, migrateCarForm } from '../utils/car';
import { CarInputs } from './CarInputs';
import { CarResults } from './CarResults';

interface Props {
  /** Monthly net pay from the OT calculator (enables the "Use OT net pay" shortcut). */
  otNet?: number;
}

/** Car financing tab: inputs on the left (stacked on phones), dashboard on the right. */
export function CarCalculator({ otNet }: Props) {
  const [form, setForm] = useLocalStorage<CarForm>('carcalc.inputs.v1', DEFAULT_CAR_FORM, migrateCarForm);
  const result = useMemo(() => computeCar(form), [form]);
  const update = (patch: Partial<CarForm>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:items-start">
      <CarInputs form={form} update={update} result={result} otNet={otNet} onReset={() => setForm(DEFAULT_CAR_FORM)} />
      <CarResults result={result} />
    </div>
  );
}
