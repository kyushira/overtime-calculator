import { useState, type ReactNode } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import {
  annualTotal,
  formatRenewalDate,
  monthlyTotal,
  relativeDays,
  sanitiseSubscriptions,
  sortByRenewal,
  SUBSCRIPTIONS_STORAGE_KEY,
  upcoming,
  UPCOMING_WINDOW_DAYS,
  type Subscription,
} from '../../subscriptions/subscriptionsModel';
import { money } from '../../utils/format';
import { Badge, btnGhost, btnPrimary, Card } from '../ui';
import { SubscriptionForm } from './SubscriptionForm';

const NONE: Subscription[] = [];

/** Which form is open: a new one above the list, or an edit that replaces a row. */
type Editor = { kind: 'new' } | { kind: 'edit'; id: string } | null;

/** "S$12.98 / month" or "S$120.00 / year". */
function costLabel(s: Subscription): string {
  return `${money(s.cost)} / ${s.cycle === 'monthly' ? 'month' : 'year'}`;
}

function SummaryTile({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-tile-blue p-4 shadow-[var(--shadow-glow-blue)]">
      <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-[20px] font-bold tabular-nums tracking-[-0.02em] text-slate-900 sm:text-2xl">
        {money(value)}
      </div>
      <div className="mt-0.5 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

/** Inline two-step delete: the row itself asks before anything is removed. */
function DeleteConfirm({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div role="group" aria-label={`Confirm delete ${name}`} className="anim-slide-in flex flex-wrap items-center justify-end gap-2">
      <span className="text-sm text-slate-700">Delete {name}?</span>
      <button type="button" onClick={onCancel} className={btnGhost}>
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-bad-bg px-3 py-1.5 text-sm font-medium text-bad transition duration-150 ease-out active:scale-[0.97]"
      >
        Delete
      </button>
    </div>
  );
}

/**
 * Subscriptions: summary of monthly and yearly totals, renewals due in the next 30 days,
 * the full list with add / edit / delete. Data lives in localStorage on this device.
 */
export function SubscriptionsView() {
  const [subs, setSubs] = useLocalStorage<Subscription[]>(SUBSCRIPTIONS_STORAGE_KEY, NONE, sanitiseSubscriptions);
  const [editor, setEditor] = useState<Editor>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const today = new Date();
  const dueSoon = upcoming(subs, today, UPCOMING_WINDOW_DAYS);
  const list = sortByRenewal(subs);
  const monthly = monthlyTotal(subs);
  const annual = annualTotal(subs);

  const save = (sub: Subscription) => {
    setSubs((prev) => {
      const exists = prev.some((s) => s.id === sub.id);
      return exists ? prev.map((s) => (s.id === sub.id ? sub : s)) : [...prev, sub];
    });
    setEditor(null);
  };

  const remove = (id: string) => {
    setSubs((prev) => prev.filter((s) => s.id !== id));
    setConfirmId(null);
  };

  const openNew = () => {
    setConfirmId(null);
    setEditor({ kind: 'new' });
  };

  const openEdit = (id: string) => {
    setConfirmId(null);
    setEditor({ kind: 'edit', id });
  };

  const addButton: ReactNode = (
    <button type="button" onClick={openNew} disabled={editor !== null} className={btnPrimary}>
      <Plus size={16} strokeWidth={1.75} aria-hidden />
      Add
    </button>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <section aria-label="Subscription totals" className="grid grid-cols-2 gap-3">
        <SummaryTile label="Per month" value={monthly} sub="All plans, yearly ÷ 12" />
        <SummaryTile label="Per year" value={annual} sub="All plans, a full year" />
      </section>

      <Card
        index={1}
        title="Renewing soon"
        subtitle={`Next ${UPCOMING_WINDOW_DAYS} days`}
      >
        {dueSoon.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing renews in the next {UPCOMING_WINDOW_DAYS} days.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {dueSoon.map(({ sub, days }) => (
              <li key={sub.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-medium text-slate-900">{sub.name}</div>
                  <div className="text-xs tabular-nums text-slate-500">{formatRenewalDate(sub.nextRenewal)}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-semibold tabular-nums text-slate-900">{money(sub.cost)}</span>
                  <Badge tone="blue" dot={false}>
                    {relativeDays(days)}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editor?.kind === 'new' && (
        <SubscriptionForm initial={null} onSave={save} onCancel={() => setEditor(null)} />
      )}

      <Card
        index={2}
        title="Active plans"
        subtitle={subs.length > 0 ? `${subs.length} ${subs.length === 1 ? 'plan' : 'plans'}` : undefined}
        actions={addButton}
        flush
      >
        {list.length === 0 ? (
          <div className="px-4 pb-5 sm:px-5">
            <p className="text-sm text-slate-500">No subscriptions yet — add your first.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 border-t border-slate-200">
            {list.map((s) => {
              if (editor?.kind === 'edit' && editor.id === s.id) {
                return (
                  <li key={s.id} className="p-4 sm:p-5">
                    <SubscriptionForm initial={s} onSave={save} onCancel={() => setEditor(null)} />
                  </li>
                );
              }
              const confirming = confirmId === s.id;
              return (
                <li key={s.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold text-slate-900">{s.name}</div>
                    <div className="text-[13px] tabular-nums text-slate-600">{costLabel(s)}</div>
                    <div className="text-xs text-slate-500">
                      Renews {formatRenewalDate(s.nextRenewal)}
                      {s.paymentMethod && <> · {s.paymentMethod}</>}
                    </div>
                  </div>
                  {confirming ? (
                    <DeleteConfirm name={s.name} onConfirm={() => remove(s.id)} onCancel={() => setConfirmId(null)} />
                  ) : (
                    <div className="flex shrink-0 items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(s.id)}
                        disabled={editor !== null}
                        aria-label={`Edit ${s.name}`}
                        title="Edit"
                        className={`${btnGhost} min-h-11 min-w-11 disabled:opacity-40`}
                      >
                        <Pencil size={16} strokeWidth={1.75} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(s.id)}
                        disabled={editor !== null}
                        aria-label={`Delete ${s.name}`}
                        title="Delete"
                        className={`${btnGhost} min-h-11 min-w-11 hover:text-bad disabled:opacity-40`}
                      >
                        <Trash2 size={16} strokeWidth={1.75} aria-hidden />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="pt-2 text-center text-xs text-slate-400">
        Saved on this device only. Totals are estimates in SGD.
      </p>
    </div>
  );
}
