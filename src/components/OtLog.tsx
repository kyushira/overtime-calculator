import { CalendarCheck, Check, Clock, Eraser, Hand, Landmark, Moon, Sun, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { pop } from '../hooks/useMotion';
import type { DayKind, DayStatus, DayTotals, OtEntry, PayCycle } from '../types/payroll';
import { dayKind, formatDate, isInOtCycle, parseIsoDate, toIsoDate } from '../utils/cycle';
import {
  applyHoldOption,
  clearCycle,
  cycleDays,
  holdOptionAllowed,
  markAllWorked,
  setDayStatus,
  tapDay,
  type HoldOption,
  type OtHours,
} from '../utils/dayLog';
import { money, num } from '../utils/format';

interface Props {
  cycle: PayCycle;
  entries: OtEntry[];
  onChange: (entries: OtEntry[]) => void;
  otHours: OtHours;
  totals: DayTotals;
  shiftAllowancePerShift: number;
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Hold this long to open the day's option menu. */
export const LONG_PRESS_MS = 450;
/** Moving the finger further than this (px) cancels the hold (it's a scroll). */
const MOVE_TOLERANCE = 10;
/** Gap between the day cell and a menu shown ABOVE it, so the thumb doesn't cover the menu. */
const MENU_GAP_ABOVE = 30;
const MENU_GAP_BELOW = 14;
const VIEW_MARGIN = 8;

/** Colour per calendar state. Shared by the day buttons and the legend. */
function dayStyle(kind: DayKind, status: DayStatus | undefined) {
  if (!status) return kind === 'weekday' ? 'bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-slate-300' : 'bg-slate-100 text-slate-400 ring-1 ring-slate-200 hover:ring-slate-300';
  if (status === 'ph') return 'bg-ph-bg text-ph ring-1 ring-ph/45';
  if (kind === 'sunday') return 'bg-sun-bg text-sun ring-1 ring-sun/35';
  if (kind === 'saturday') return 'bg-sat-bg text-sat ring-1 ring-sat/35';
  if (status === 'ot') return 'bg-accent text-white ring-1 ring-accent';
  if (status === 'otLong') return 'bg-accent-dark text-white ring-1 ring-accent-dark';
  return 'bg-good-bg text-good ring-1 ring-good/35';
}

/** 1 → "1", 1.25 → "1¼", 1.5 → "1½", 0.75 → "¾". */
export function fmtHours(h: number) {
  const whole = Math.floor(h);
  const frac = Math.round((h - whole) * 100);
  const f = frac === 25 ? '¼' : frac === 50 ? '½' : frac === 75 ? '¾' : '';
  if (frac && !f) return num(h);
  return `${whole || (f ? '' : '0')}${f}`;
}

function stateLabel(kind: DayKind, status: DayStatus | undefined, h: OtHours) {
  if (!status) return 'off';
  if (status === 'ph') return 'public holiday worked';
  if (kind === 'sunday') return 'Sunday OT shift';
  if (kind === 'saturday') return 'Saturday OT shift';
  if (status === 'ot') return `worked + ${num(h.short)} hr OT`;
  if (status === 'otLong') return `worked + ${num(h.long)} hr OT`;
  return 'worked';
}

/** Short toast text for a state change. */
function changeLabel(status: DayStatus | undefined, kind: DayKind, h: OtHours) {
  if (!status) return 'Off';
  if (status === 'ph') return 'Public holiday';
  if (status === 'otLong') return `+${fmtHours(h.long)} hr OT`;
  return stateLabel(kind, status, h);
}

const shortDate = (d: Date) => d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');

interface Menu {
  iso: string;
  rect: { top: number; bottom: number; left: number; width: number };
}

/**
 * Calendar of the OT cycle (e.g. 14 Sep → 13 Oct).
 * Tap: weekday off → worked → +short OT → off; Sat / Sun off ↔ worked.
 * Hold (~450ms): a small menu above the day with "+1¼ hr OT" (weekdays) and
 * "Public holiday (2x)". All totals are derived from the calendar. Entries are
 * stored globally, so dates from other cycles count towards their own month.
 */
export function OtLog({ cycle, entries, onChange, otHours, totals, shiftAllowancePerShift }: Props) {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const days = cycleDays(cycle);
  const leadingBlanks = (days[0].getDay() + 6) % 7; // Monday-first grid

  const outside = entries.filter((e) => {
    const d = parseIsoDate(e.date);
    return !(d && isInOtCycle(d, cycle));
  }).length;
  const shifts = totals.normalShifts + totals.saturdayShifts + totals.sundayShifts + totals.publicHolidayShifts;

  /* ---------------- hold detection ---------------- */
  const press = useRef<{ iso: string; x: number; y: number; timer: number } | null>(null);
  const longPressed = useRef<string | null>(null);
  const [pressing, setPressing] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
    setPressing(null);
  };

  const startPress = (ev: React.PointerEvent<HTMLButtonElement>, iso: string) => {
    if (ev.button !== 0) return;
    cancelPress();
    longPressed.current = null;
    const el = ev.currentTarget;
    setPressing(iso);
    const timer = window.setTimeout(() => {
      press.current = null;
      setPressing(null);
      longPressed.current = iso;
      pop(el);
      try {
        navigator.vibrate?.(15);
      } catch {
        /* not supported */
      }
      const r = el.getBoundingClientRect();
      setMenu({ iso, rect: { top: r.top, bottom: r.bottom, left: r.left, width: r.width } });
    }, LONG_PRESS_MS);
    press.current = { iso, x: ev.clientX, y: ev.clientY, timer };
  };

  const movePress = (ev: React.PointerEvent) => {
    const p = press.current;
    if (p && Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > MOVE_TOLERANCE) cancelPress();
  };

  useEffect(() => () => cancelPress(), []);

  /* ---------------- toast ---------------- */
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 1600);
    return () => window.clearTimeout(t);
  }, [toast]);

  /* ---------------- menu actions ---------------- */
  const choose = (iso: string, option: HoldOption | 'clear') => {
    const next = option === 'clear' ? setDayStatus(entries, iso, undefined) : applyHoldOption(entries, iso, option);
    setMenu(null);
    onChange(next);
    const d = parseIsoDate(iso)!;
    const status = next.find((e) => e.date === iso)?.status;
    setToast({ text: `${shortDate(d)} → ${changeLabel(status, dayKind(d), otHours)}`, id: Date.now() });
    requestAnimationFrame(() => pop(document.querySelector(`[data-date="${iso}"]`)));
  };

  const chip = 'inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition duration-150 ease-out active:scale-[0.96]';
  const ic = { size: 14, strokeWidth: 1.5, 'aria-hidden': true } as const;

  const legend: { cls: string; label: string; mark?: string }[] = [
    { cls: dayStyle('weekday', undefined), label: 'Off' },
    { cls: dayStyle('weekday', 'worked'), label: 'Worked' },
    { cls: dayStyle('weekday', 'ot'), label: `+${fmtHours(otHours.short)}h OT` },
    { cls: dayStyle('weekday', 'otLong'), label: `+${fmtHours(otHours.long)}h OT` },
    { cls: dayStyle('saturday', 'worked'), label: 'Sat' },
    { cls: dayStyle('sunday', 'worked'), label: 'Sun' },
    { cls: dayStyle('weekday', 'ph'), label: 'Public holiday', mark: 'PH' },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Tap a weekday: off → worked → +{fmtHours(otHours.short)}h OT → off. Sat/Sun: off ↔ OT shift.
      </p>

      <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-slate-600" aria-label="Calendar legend">
        {legend.map((l) => (
          <li key={l.label} className="flex items-center gap-1.5">
            <span className={`inline-flex size-3.5 items-center justify-center rounded-[4px] text-[6px] font-bold ${l.cls}`} aria-hidden>{l.mark}</span>
            {l.label}
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-1.5 text-xs font-medium text-accent">
        <Hand size={13} strokeWidth={1.75} aria-hidden /> Hold a day for +{fmtHours(otHours.long)} hr OT or public holiday
      </p>

      <div className="relative">
        {toast && (
          <div key={toast.id} role="status" className="anim-toast pointer-events-none absolute inset-x-0 -top-1 z-10 flex justify-center">
            <span className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white shadow-[var(--shadow-lift)]">{toast.text}</span>
          </div>
        )}
        <div className="grid grid-cols-7 gap-1 text-center">
          {DOW.map((d) => <div key={d} className="pb-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">{d}</div>)}
          {Array.from({ length: leadingBlanks }, (_, i) => <div key={`b${i}`} />)}
          {days.map((d) => {
            const iso = toIsoDate(d);
            const kind = dayKind(d);
            const status = byDate.get(iso)?.status;
            const showMonth = d.getDate() === 1 || d.getTime() === cycle.otStart.getTime();
            const sub =
              status === 'ph' ? 'PH'
              : kind === 'weekday' && status === 'ot' ? `+${fmtHours(otHours.short)}h`
              : kind === 'weekday' && status === 'otLong' ? `+${fmtHours(otHours.long)}`
              : showMonth ? d.toLocaleString('en', { month: 'short' }) : '\u00a0';
            const label = `${formatDate(d)}: ${stateLabel(kind, status, otHours)}`;
            const isPressing = pressing === iso;
            const isOpen = menu?.iso === iso;
            return (
              <button
                key={iso}
                type="button"
                data-date={iso}
                data-state={status ?? 'off'}
                aria-label={label}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                title={label}
                onPointerDown={(ev) => startPress(ev, iso)}
                onPointerMove={movePress}
                onPointerUp={cancelPress}
                onPointerCancel={cancelPress}
                onPointerLeave={cancelPress}
                onContextMenu={(ev) => ev.preventDefault()}
                onClick={(ev) => {
                  // A hold already handled this day; swallow the click that follows it.
                  if (longPressed.current === iso) {
                    longPressed.current = null;
                    return;
                  }
                  pop(ev.currentTarget);
                  onChange(tapDay(entries, iso));
                }}
                style={{ WebkitTouchCallout: 'none', touchAction: 'manipulation' }}
                className={`day-cell relative min-h-11 min-w-0 select-none rounded-lg py-1 text-sm font-semibold leading-tight transition-[background-color,color,box-shadow] duration-200 ease-out [-webkit-user-select:none] ${dayStyle(kind, status)} ${isOpen ? 'z-10 ring-2 ring-ink' : ''}`}
              >
                {d.getDate()}
                <span className={`block text-[10px] leading-none ${status === 'ph' ? 'font-bold tracking-wide' : 'font-medium opacity-80'}`}>{sub}</span>
                {isPressing && (
                  <>
                    {/* Press-progress ring: grows beyond the cell so it shows around the thumb. */}
                    <span aria-hidden className="hold-ring pointer-events-none absolute -inset-2 rounded-xl border-2 border-accent" />
                    {/* Floating cue above the finger. */}
                    <span aria-hidden className="pointer-events-none absolute -top-9 left-1/2 z-20 -translate-x-1/2">
                      <span className="hold-label block whitespace-nowrap rounded-full bg-ink px-2 py-1 text-[10px] font-medium text-white">Hold…</span>
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onChange(markAllWorked(entries, cycle, 'weekday'))} className={`${chip} border-good/25 bg-good-bg text-good hover:border-good/50`}><CalendarCheck {...ic} />All weekdays worked</button>
        <button type="button" onClick={() => onChange(markAllWorked(entries, cycle, 'sunday'))} className={`${chip} border-sun/25 bg-sun-bg text-sun hover:border-sun/50`}><Moon {...ic} />All Sundays</button>
        <button type="button" onClick={() => onChange(markAllWorked(entries, cycle, 'saturday'))} className={`${chip} border-sat/25 bg-sat-bg text-sat hover:border-sat/50`}><Sun {...ic} />All Saturdays</button>
        <button type="button" onClick={() => onChange(clearCycle(entries, cycle))} className={`${chip} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}><Eraser {...ic} />Clear cycle</button>
      </div>

      <div className="rounded-xl bg-slate-100/70 p-3.5 text-sm">
        <dl className="grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-5">
          <div><dt className="text-xs text-slate-500">Normal shifts</dt><dd className="text-lg font-bold tabular-nums text-good">{totals.normalShifts}</dd></div>
          <div><dt className="text-xs text-slate-500">Weekday OT</dt><dd className="text-lg font-bold tabular-nums text-accent">{num(totals.weekdayOtHours)} <span className="text-xs font-medium">hrs</span></dd></div>
          <div><dt className="text-xs text-slate-500">Saturdays</dt><dd className="text-lg font-bold tabular-nums text-sat">{totals.saturdayShifts}</dd></div>
          <div><dt className="text-xs text-slate-500">Sundays</dt><dd className="text-lg font-bold tabular-nums text-sun">{totals.sundayShifts}</dd></div>
          <div><dt className="text-xs text-slate-500">Public holidays</dt><dd className="text-lg font-bold tabular-nums text-ph">{totals.publicHolidayShifts}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-slate-600">
          Shift allowance: {shifts} shifts × {money(shiftAllowancePerShift)} = <strong>{money(shifts * shiftAllowancePerShift)}</strong>
        </p>
        {outside > 0 && <p className="mt-2 text-xs text-slate-500">{outside} saved date(s) fall outside this OT cycle and count towards other months.</p>}
        <p className="mt-2 text-xs text-slate-500">
          Assumption: normal shifts are counted over the same OT cycle ({formatDate(cycle.otStart, false)} – {formatDate(cycle.otEnd, false)}),
          so the shift allowance on payday covers shifts worked in this window. A public holiday is paid like a Sunday and isn't a normal shift.
        </p>
      </div>

      {menu && (
        <HoldMenu
          menu={menu}
          status={byDate.get(menu.iso)?.status}
          otHours={otHours}
          onChoose={(opt) => choose(menu.iso, opt)}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hold menu (portal, fixed-position, kept inside the viewport)        */
/* ------------------------------------------------------------------ */

function HoldMenu({ menu, status, otHours, onChoose, onClose }: {
  menu: Menu;
  status: DayStatus | undefined;
  otHours: OtHours;
  onChoose: (o: HoldOption | 'clear') => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean; originX: number } | null>(null);
  const d = parseIsoDate(menu.iso)!;
  const kind = dayKind(d);

  // Place above the cell (clear of the thumb); flip below if there's no room; clamp horizontally.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width: w, height: h } = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const r = menu.rect;
    const aboveTop = r.top - MENU_GAP_ABOVE - h;
    const above = aboveTop >= VIEW_MARGIN;
    let top = above ? aboveTop : r.bottom + MENU_GAP_BELOW;
    top = Math.max(VIEW_MARGIN, Math.min(top, vh - VIEW_MARGIN - h));
    const cx = r.left + r.width / 2;
    const left = Math.max(VIEW_MARGIN, Math.min(cx - w / 2, vw - VIEW_MARGIN - w));
    setPos({ left, top, above, originX: Math.max(0, Math.min(w, cx - left)) });
  }, [menu]);

  // Close on outside tap, Escape or scroll.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onScroll = () => onClose();
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    ref.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  const longOk = holdOptionAllowed(kind, 'otLong');
  const opt = 'flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition duration-150 ease-out active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45';

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={`Options for ${formatDate(d)}`}
      data-hold-menu
      className={`fixed z-50 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_12px_32px_rgba(16,24,40,0.16)] ${pos ? 'anim-menu-in' : 'invisible'}`}
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        transformOrigin: pos ? `${pos.originX}px ${pos.above ? '100%' : '0%'}` : undefined,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex items-center justify-between px-2.5 pt-1 pb-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">{shortDate(d)}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <X size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={status === 'otLong'}
        disabled={!longOk}
        onClick={() => onChoose('otLong')}
        className={`${opt} min-h-11 ${status === 'otLong' ? 'bg-accent-dark text-white' : 'text-slate-900 hover:bg-accent-bg'}`}
      >
        <span className={`flex size-7 items-center justify-center rounded-md ${status === 'otLong' ? 'bg-white/15' : 'bg-accent-bg text-accent'}`}><Clock size={16} strokeWidth={1.75} aria-hidden /></span>
        <span className="flex-1">
          +{fmtHours(otHours.long)} hr OT
          <span className={`block text-[11px] font-normal ${status === 'otLong' ? 'text-white/75' : 'text-slate-500'}`}>
            {longOk ? (status === 'otLong' ? 'Active · tap to clear' : 'Worked + long OT') : 'Weekdays only'}
          </span>
        </span>
        {status === 'otLong' && <Check size={16} strokeWidth={2} aria-hidden />}
      </button>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={status === 'ph'}
        onClick={() => onChoose('ph')}
        className={`${opt} min-h-11 mt-1 ${status === 'ph' ? 'bg-ph text-white' : 'text-slate-900 hover:bg-ph-bg'}`}
      >
        <span className={`flex size-7 items-center justify-center rounded-md ${status === 'ph' ? 'bg-white/15' : 'bg-ph-bg text-ph'}`}><Landmark size={16} strokeWidth={1.75} aria-hidden /></span>
        <span className="flex-1">
          Public holiday (2x)
          <span className={`block text-[11px] font-normal ${status === 'ph' ? 'text-white/75' : 'text-slate-500'}`}>
            {status === 'ph' ? 'Active · tap to clear' : 'Paid like a Sunday'}
          </span>
        </span>
        {status === 'ph' && <Check size={16} strokeWidth={2} aria-hidden />}
      </button>
      {status && (
        <button
          type="button"
          role="menuitem"
          onClick={() => onChoose('clear')}
          className="mt-1 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          <Eraser size={13} strokeWidth={1.75} aria-hidden /> Clear day
        </button>
      )}
    </div>,
    document.body,
  );
}
