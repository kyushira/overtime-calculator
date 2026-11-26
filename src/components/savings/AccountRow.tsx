import { Pencil, Trash2 } from 'lucide-react';
import { targetProgress, type Account } from '../../savings/savingsModel';
import { money, num } from '../../utils/format';
import { btnGhost } from '../ui';

interface Props {
  account: Account;
  confirming: boolean;
  onEdit: () => void;
  onAskDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}

const iconBtn =
  'grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg text-slate-500 transition duration-150 ease-out hover:bg-slate-100 hover:text-slate-900 active:scale-95';

/** One account: name, balance, optional goal progress and rate, with edit and inline delete confirm. */
export function AccountRow({ account: a, confirming, onEdit, onAskDelete, onConfirmDelete, onCancelDelete }: Props) {
  const pct = targetProgress(a.balance, a.target);
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-slate-900">{a.name}</div>
          {a.interestRate !== undefined && (
            <div className="mt-0.5 text-[13px] text-slate-500">{num(a.interestRate, 2)}% p.a.</div>
          )}
        </div>
        <div className="shrink-0 pt-0.5 text-right text-[15px] font-semibold tabular-nums text-slate-900">{money(a.balance)}</div>
      </div>

      {pct !== null && a.target !== undefined && (
        <div className="mt-2">
          <div className="flex items-baseline justify-between gap-2 text-xs text-slate-500">
            <span className="tabular-nums">{pct}% to goal</span>
            <span className="min-w-0 truncate tabular-nums">of {money(a.target)}</span>
          </div>
          <div
            role="progressbar"
            aria-label={`${a.name} progress to goal`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"
          >
            <div className="h-full rounded-full bg-good transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="mt-2 flex justify-end">
        {confirming ? (
          <div role="group" aria-label={`Confirm delete ${a.name}`} className="flex flex-wrap items-center justify-end gap-1">
            <span className="px-1 text-sm text-slate-700">Delete?</span>
            <button type="button" onClick={onConfirmDelete} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-bad transition duration-150 hover:bg-bad-bg active:scale-[0.97]">
              Yes
            </button>
            <button type="button" onClick={onCancelDelete} className={`${btnGhost} min-h-11`}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button type="button" onClick={onEdit} aria-label={`Edit ${a.name}`} title="Edit" className={iconBtn}>
              <Pencil size={18} strokeWidth={1.5} aria-hidden />
            </button>
            <button type="button" onClick={onAskDelete} aria-label={`Delete ${a.name}`} title="Delete" className={`${iconBtn} hover:text-bad`}>
              <Trash2 size={18} strokeWidth={1.5} aria-hidden />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
