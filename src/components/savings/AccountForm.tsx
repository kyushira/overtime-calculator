import { useState } from 'react';
import { validateDraft, type AccountDraft, type DraftErrors } from '../../savings/savingsModel';
import { AmountInput } from '../tax/AmountInput';
import { btnGhost, btnPrimary, Field, inputClass, NumInput } from '../ui';

interface Props {
  heading: string;
  initial: AccountDraft;
  onSave: (d: AccountDraft) => void;
  onCancel: () => void;
}

/** Add/Edit account form. Errors appear after the first save attempt, then update live. */
export function AccountForm({ heading, initial, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState(initial);
  const [tried, setTried] = useState(false);
  const errors: DraftErrors = tried ? validateDraft(draft) : {};
  const patch = (p: Partial<AccountDraft>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <form
      noValidate
      aria-label={heading}
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (Object.keys(validateDraft(draft)).length === 0) onSave(draft);
      }}
      className="space-y-3"
    >
      <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">{heading}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" error={errors.name} className="sm:col-span-2">
          <input
            type="text"
            autoComplete="off"
            placeholder="e.g. Emergency fund"
            value={draft.name}
            aria-invalid={!!errors.name}
            onChange={(e) => patch({ name: e.target.value })}
            className={inputClass(errors.name)}
          />
        </Field>
        <Field label="Balance" error={errors.balance} className="min-w-0">
          <AmountInput
            value={draft.balance}
            prefix="S$"
            ariaLabel="Balance in S$"
            onChange={(v) => patch({ balance: v })}
          />
        </Field>
        <Field label="Goal (optional)" error={errors.target} hint="Leave blank for no goal." className="min-w-0">
          <AmountInput
            value={draft.target}
            prefix="S$"
            ariaLabel="Goal in S$"
            onChange={(v) => patch({ target: v })}
          />
        </Field>
        <Field label="Interest rate (optional)" error={errors.rate} className="sm:col-span-2">
          <NumInput
            value={draft.rate}
            step="0.01"
            suffix="% p.a."
            ariaLabel="Interest rate, % per year"
            error={errors.rate}
            onChange={(rate) => patch({ rate })}
          />
        </Field>
      </div>
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className={`${btnGhost} min-h-11`}>
          Cancel
        </button>
        <button type="submit" className={`${btnPrimary} min-h-11`}>
          Save
        </button>
      </div>
    </form>
  );
}
