import { ChevronDown } from 'lucide-react';
import type { PayResult } from '../../types/payroll';
import { money } from '../../utils/format';

const MASK = '$ ••••';

/**
 * One-line summary for tabs other than Calculator: "November 2026 · Net $2,734.00".
 * Tapping expands the full 2×2 grid (rendered by the parent). aria-expanded carries the state.
 */
export function SummaryStrip({ result, hidden, periodLabel, expanded, onToggle }: {
  result: PayResult;
  hidden: boolean;
  periodLabel: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 py-2 text-left transition-colors duration-150 hover:text-slate-900"
    >
      <span className="min-w-0 truncate text-[13px] text-slate-900 tabular-nums">
        <span className="font-semibold">{periodLabel ?? 'Pay period'}</span>
        <span className="text-slate-500"> · Net </span>
        <span className="font-bold">{hidden ? MASK : money(result.net)}</span>
      </span>
      <ChevronDown
        size={16}
        strokeWidth={1.75}
        aria-hidden
        className={`shrink-0 text-slate-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
      />
    </button>
  );
}
