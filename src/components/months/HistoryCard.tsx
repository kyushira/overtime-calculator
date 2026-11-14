import { ChevronDown, FolderOpen, Trash2 } from 'lucide-react';
import { num } from '../../utils/format';
import { monthLabel, sortNewestFirst, stats, trend, type SavedLine, type SavedMonth } from '../../utils/months';
import { btnOutline, Card, SectionLabel } from '../ui';
import { fmtSavedDate, Stat, type Fmt } from './shared';

interface Props {
  months: SavedMonth[];
  fmt: Fmt;
  onOpen: (m: SavedMonth) => void;
  onDelete: (m: SavedMonth) => void;
}

const CARD_POS = 'lg:col-start-2 lg:row-span-2 lg:row-start-1';

/** Saved months: stats, net trend, and a newest-first list with open / delete. */
export function HistoryCard({ months, fmt, onOpen, onDelete }: Props) {
  if (months.length === 0) {
    return (
      <Card title="History" subtitle="Saved payout months" index={1} className={CARD_POS}>
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
          <p className="text-sm font-medium text-slate-900">No saved months yet</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">
            Save the month from the card above. Saved months appear here with a net trend and a line per month.
          </p>
        </div>
      </Card>
    );
  }

  const sorted = sortNewestFirst(months);
  const s = stats(sorted);
  const points = trend(sorted, 6);
  const top = Math.max(...points.map((p) => p.net), 0);

  return (
    <Card title="History" subtitle={`${s.count} saved · newest first`} index={1} className={CARD_POS}>
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
        <Stat label="Months saved" value={String(s.count)} />
        <Stat label="Total net" value={fmt(s.totalNet)} />
        <Stat label="Average net" value={fmt(s.averageNet)} />
      </div>

      <div className="mt-5">
        <SectionLabel>Net trend · last {points.length}</SectionLabel>
        <div
          role="img"
          aria-label={`Net pay, oldest to newest: ${points.map((p) => `${p.label} ${fmt(p.net)}`).join(', ')}`}
          className="mt-2 flex h-28 items-end gap-2"
        >
          {points.map((p, i) => (
            <div key={p.id} aria-hidden className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              <div
                className={`w-3/5 rounded-t-md transition-[height] duration-500 ease-out ${i === points.length - 1 ? 'bg-accent' : 'bg-ink/80'}`}
                style={{ height: `${Math.max(4, top > 0 ? (p.net / top) * 100 : 0)}%` }}
              />
              <span className="w-full truncate text-center text-[11px] text-slate-500">{p.label}</span>
            </div>
          ))}
        </div>
      </div>

      <ul className="mt-5 divide-y divide-slate-100 border-t border-slate-100">
        {sorted.map((m) => (
          <HistoryRow key={m.id} m={m} fmt={fmt} onOpen={onOpen} onDelete={onDelete} />
        ))}
      </ul>
    </Card>
  );
}

function HistoryRow({ m, fmt, onOpen, onDelete }: { m: SavedMonth } & Omit<Props, 'months'>) {
  const label = monthLabel(m.year, m.month);
  const f = m.figures;
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900">{label}</div>
          <div className="mt-0.5 text-xs leading-relaxed text-slate-500 tabular-nums">
            Gross {fmt(f.gross)} · Deductions {fmt(f.totalDeductions)} · {f.normalShifts} shifts · {num(f.weekdayOtHours)} h OT · Sat {f.saturdayShifts} / Sun {f.sundayShifts} / PH {f.publicHolidayShifts}
          </div>
          <div className="text-[11px] text-slate-400">Saved {fmtSavedDate(m.savedAt)}</div>
        </div>
        <div className="shrink-0 text-right text-base font-bold tabular-nums text-slate-900">{fmt(f.net)}</div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          aria-label={`Open ${label}`}
          onClick={() => onOpen(m)}
          className={`${btnOutline} min-h-11 px-3.5`}
        >
          <FolderOpen size={16} strokeWidth={1.5} aria-hidden /> Open
        </button>
        <button
          type="button"
          aria-label={`Delete ${label}`}
          onClick={() => onDelete(m)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-600 transition duration-150 ease-out hover:bg-bad-bg hover:text-bad active:scale-[0.97]"
        >
          <Trash2 size={16} strokeWidth={1.5} aria-hidden /> Delete
        </button>
      </div>

      <details className="group mt-1">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-[13px] font-medium text-slate-600 transition-colors hover:text-slate-900 [&::-webkit-details-marker]:hidden">
          Earnings &amp; deductions
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden className="transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="grid gap-4 pb-1 sm:grid-cols-2">
          <LineList title="Earnings" lines={m.earnings} fmt={fmt} />
          <LineList title="Deductions" lines={m.deductions} fmt={fmt} />
        </div>
      </details>
    </li>
  );
}

function LineList({ title, lines, fmt }: { title: string; lines: SavedLine[]; fmt: Fmt }) {
  return (
    <div className="min-w-0">
      <SectionLabel>{title}</SectionLabel>
      <ul className="mt-1 space-y-1 text-sm text-slate-600">
        {lines.map((l, i) => (
          <li key={`${l.label}-${i}`} className="flex justify-between gap-2">
            <span className="min-w-0 truncate">{l.label}</span>
            <span className="shrink-0 tabular-nums">{fmt(l.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
