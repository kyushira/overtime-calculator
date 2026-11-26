import { useState, type FormEvent } from 'react';
import { AmountInput } from '../tax/AmountInput';
import { Field, btnGhost, btnPrimary, Card, inputClass, Segmented } from '../ui';
import { isoDayNumber, toIsoDate, type Cycle, type Subscription } from '../../subscriptions/subscriptionsModel';

interface Props {
  /** The subscription being edited, or null for a new one. */
  initial: Subscription | null;
  onSave: (sub: Subscription) => void;
  onCancel: () => void;
}

interface FormValues {
  name: string;
  cost: number | null;
  cycle: Cycle;
  nextRenewal: string;
  paymentMethod: string;
}

interface Errors {
  name?: string;
  cost?: string;
  nextRenewal?: string;
}

const CYCLE_OPTIONS: { value: Cycle; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

function makeId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function validate(v: FormValues): Errors {
  const e: Errors = {};
  if (v.name.trim() === '') e.name = 'Enter a name.';
  if (v.cost === null) e.cost = 'Enter an amount, 0 or more.';
  if (isoDayNumber(v.nextRenewal) === null) e.nextRenewal = 'Pick a valid renewal date.';
  return e;
}

/**
 * Add / edit form for one subscription. Errors appear after the first submit attempt, so
 * the form does not open already shouting at the user.
 */
export function SubscriptionForm({ initial, onSave, onCancel }: Props) {
  const [values, setValues] = useState<FormValues>(() =>
    initial
      ? {
          name: initial.name,
          cost: initial.cost,
          cycle: initial.cycle,
          nextRenewal: initial.nextRenewal,
          paymentMethod: initial.paymentMethod,
        }
      : { name: '', cost: null, cycle: 'monthly', nextRenewal: toIsoDate(new Date()), paymentMethod: '' },
  );
  const [tried, setTried] = useState(false);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const errors = tried ? validate(values) : {};

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(validate(values)).length > 0 || values.cost === null) return;
    onSave({
      id: initial?.id ?? makeId(),
      name: values.name.trim(),
      cost: values.cost,
      cycle: values.cycle,
      nextRenewal: values.nextRenewal,
      paymentMethod: values.paymentMethod.trim(),
    });
  };

  return (
    <Card title={initial ? 'Edit subscription' : 'Add subscription'} flush={false} className="anim-slide-in">
      <form noValidate onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.name} className="min-w-0">
            <input
              type="text"
              autoComplete="off"
              value={values.name}
              aria-invalid={!!errors.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Netflix"
              className={inputClass(errors.name)}
            />
          </Field>

          <Field label="Cost" error={errors.cost} className="min-w-0">
            <AmountInput
              value={values.cost}
              prefix="S$"
              ariaLabel="Cost in S$"
              onChange={(v) => set('cost', v)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-700">Billing cycle</span>
            <Segmented
              value={values.cycle}
              options={CYCLE_OPTIONS}
              onChange={(c) => set('cycle', c)}
              ariaLabel="Billing cycle"
              accentSelected
            />
          </div>

          <Field label="Next renewal" error={errors.nextRenewal} className="min-w-0">
            <input
              type="date"
              value={values.nextRenewal}
              aria-invalid={!!errors.nextRenewal}
              onChange={(e) => set('nextRenewal', e.target.value)}
              className={inputClass(errors.nextRenewal)}
            />
          </Field>
        </div>

        <Field label="Payment method" hint="Free text, e.g. Visa ending 4421 or GIRO." className="min-w-0">
          <input
            type="text"
            autoComplete="off"
            value={values.paymentMethod}
            onChange={(e) => set('paymentMethod', e.target.value)}
            placeholder="Optional"
            className={inputClass()}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className={btnGhost}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary}>
            {initial ? 'Save changes' : 'Add subscription'}
          </button>
        </div>
      </form>
    </Card>
  );
}
