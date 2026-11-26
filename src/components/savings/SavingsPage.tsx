import { ChevronLeft, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useTheme } from '../../hooks/useTheme';
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
import { ThemeToggle } from '../ThemeToggle';
import { btnPrimary, Card } from '../ui';
import { AccountForm } from './AccountForm';
import { AccountRow } from './AccountRow';

/** Same header control as the pay/car/tax shell (App.tsx). */
const HEADER_BTN =
  'grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg transition duration-150 ease-out hover:bg-slate-100 hover:text-slate-900 active:scale-95';

/** null = list only; add = blank form; edit = form pre-filled for one account. */
type Editing = { mode: 'add' } | { mode: 'edit'; id: string } | null;

/** Savings module: net worth hero, account list, add/edit form, inline delete confirm. */
export function SavingsPage() {
  const [state, setState] = useLocalStorage<SavingsState>(SAVINGS_STORAGE_KEY, emptySavings(), parseSavings);
  const theme = useTheme();
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
      <header className="border-b border-slate-200 bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2 sm:gap-2.5 sm:px-6">
          <Link href="/" aria-label="Home" title="Home" className={`${HEADER_BTN} text-slate-500`}>
            <ChevronLeft size={22} strokeWidth={1.75} aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 id="view-title" className="truncate text-[15px] font-semibold text-slate-900 lg:text-lg">
              Savings
            </h1>
          </div>
          <div className="flex shrink-0 items-center">
            <ThemeToggle pref={theme.pref} onCycle={theme.cyclePref} />
          </div>
        </div>
      </header>

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
