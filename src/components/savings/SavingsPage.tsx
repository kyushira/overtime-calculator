import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import {
  accountFromDraft,
  draftFrom,
  emptyDraft,
  emptySavings,
  newAccountId,
  parseSavings,
  SAVINGS_STORAGE_KEY,
  totalBalance,
  type Account,
  type AccountDraft,
  type SavingsState,
} from '../../savings/savingsModel';
import { money } from '../../utils/format';
import { ModuleHeader } from '../ModuleHeader';
import { btnPrimary, Card } from '../ui';
import { AccountForm } from './AccountForm';
import { AccountRow } from './AccountRow';

/** null = list only; add = blank form; edit = form pre-filled for one account. */
type Editing = { mode: 'add' } | { mode: 'edit'; id: string } | null;

/** Savings module: net worth hero, account list, add/edit form, inline delete confirm. */
export function SavingsPage() {
  const [state, setState] = useLocalStorage<SavingsState>(SAVINGS_STORAGE_KEY, emptySavings(), parseSavings);
  const [editing, setEditing] = useState<Editing>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const accounts = state.accounts;

  const update = (f: (list: Account[]) => Account[]) => setState((s) => ({ ...s, accounts: f(s.accounts) }));

  const saveDraft = (d: AccountDraft) => {
    if (editing === null) return;
    if (editing.mode === 'add') {
      const account = accountFromDraft(d, newAccountId());
      update((list) => [...list, account]);
    } else {
      const id = editing.id;
      update((list) => list.map((a) => (a.id === id ? accountFromDraft(d, id) : a)));
    }
    setEditing(null);
  };

  const deleteAccount = (id: string) => {
    update((list) => list.filter((a) => a.id !== id));
    setConfirmId(null);
    setEditing((e) => (e && e.mode === 'edit' && e.id === id ? null : e));
  };

  const editingAccount = editing?.mode === 'edit' ? accounts.find((a) => a.id === editing.id) : undefined;
  const formInitial: AccountDraft | null =
    editing === null ? null : editing.mode === 'add' ? emptyDraft() : editingAccount ? draftFrom(editingAccount) : null;

  return (
    <div className="app-bg min-h-screen bg-page text-slate-900">
      <ModuleHeader title="Savings" />

      <main aria-labelledby="view-title" className="mx-auto max-w-2xl space-y-4 overflow-x-clip px-3 pt-4 pb-10 sm:px-6 sm:pt-6">
        <section aria-label="Net worth" className="rounded-xl bg-tile-mint p-5 shadow-[var(--shadow-glow-mint)] sm:p-6">
          <div className="text-[13px] font-medium text-slate-700">Net worth</div>
          <div className="mt-1 break-words text-[28px] font-extrabold tabular-nums tracking-[-0.02em] text-slate-900 sm:text-3xl">
            {money(totalBalance(accounts))}
          </div>
          <div className="mt-1 text-[13px] text-slate-700">
            {accounts.length === 1 ? '1 account' : `${accounts.length} accounts`}
          </div>
        </section>

        <Card
          title="Accounts"
          actions={
            <button type="button" onClick={() => { setConfirmId(null); setEditing({ mode: 'add' }); }} className={`${btnPrimary} min-h-11`}>
              <Plus size={16} strokeWidth={1.75} aria-hidden /> Add account
            </button>
          }
        >
          {formInitial && (
            <div className="mb-4 border-b border-slate-200 pb-4">
              <AccountForm
                key={editing?.mode === 'edit' ? editing.id : 'new'}
                heading={editing?.mode === 'edit' ? 'Edit account' : 'New account'}
                initial={formInitial}
                onSave={saveDraft}
                onCancel={() => setEditing(null)}
              />
            </div>
          )}

          {accounts.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No accounts yet — add your first</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {accounts.map((a) => (
                <AccountRow
                  key={a.id}
                  account={a}
                  confirming={confirmId === a.id}
                  onEdit={() => {
                    setConfirmId(null);
                    setEditing({ mode: 'edit', id: a.id });
                  }}
                  onAskDelete={() => setConfirmId(a.id)}
                  onConfirmDelete={() => deleteAccount(a.id)}
                  onCancelDelete={() => setConfirmId(null)}
                />
              ))}
            </ul>
          )}
        </Card>

        <p className="pt-2 text-center text-xs text-slate-400">Saved on this device only.</p>
      </main>
    </div>
  );
}
