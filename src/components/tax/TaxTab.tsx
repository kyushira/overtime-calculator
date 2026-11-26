import { useCallback, useMemo } from 'react';
import type { ReliefId } from '../../tax';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { ReliefTracker } from './ReliefTracker';
import { TaxProfileCard } from './TaxProfileCard';
import { TaxResultsCard } from './TaxResultsCard';
import {
  buildTaxView,
  defaultTaxState,
  migrateTaxState,
  TAX_STORAGE_KEY,
  type EntryState,
  type TaxState,
} from './taxModel';
import { YearEndReminder } from './YearEndReminder';

/** Used only when a relief has no saved entry; migrateTaxState fills every relief. */
const EMPTY_ENTRY: EntryState = { eligible: false, amount: null, units: 0 };

/**
 * Tax tab: profile, relief tracker, results and year-end reminder. All figures
 * come from buildTaxView; this component only renders and edits state.
 */
export function TaxTab() {
  const [state, setState] = useLocalStorage<TaxState>(TAX_STORAGE_KEY, defaultTaxState(), migrateTaxState);
  const view = useMemo(() => buildTaxView(state), [state]);

  const setProfile = useCallback(
    (patch: Partial<TaxState>) => setState((s) => ({ ...s, ...patch })),
    [setState],
  );
  const setEntry = useCallback(
    (id: ReliefId, patch: Partial<EntryState>) =>
      setState((s) => ({
        ...s,
        entries: { ...s.entries, [id]: { ...EMPTY_ENTRY, ...s.entries[id], ...patch } },
      })),
    [setState],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <TaxProfileCard state={state} setProfile={setProfile} />
      <ReliefTracker view={view} ya={state.ya} setEntry={setEntry} />
      <TaxResultsCard view={view} ya={state.ya} />
      <YearEndReminder reminders={view.reminders} />
      <p className="pt-2 text-center text-xs text-slate-400">
        Estimates only, not tax advice. The CPF suggestion assumes an even monthly salary.
      </p>
    </div>
  );
}
