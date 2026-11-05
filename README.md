# Salary & OT Calculator

React + TypeScript + Vite + Tailwind. No backend; settings and inputs persist in localStorage.

```bash
npm install
npm run dev      # http://localhost:5280
npm test         # calculation, calendar and migration tests
npm run build
```

## Structure

| Path | Purpose |
|---|---|
| `src/types/payroll.ts` | Domain types (rules, CPF, inputs, results, calendar entries) |
| `src/utils/defaults.ts` | **Factory pay rules — edit here when rules change** |
| `src/utils/payroll.ts` | Rates, CPF, gross/net calculation, target-mode solver |
| `src/utils/cycle.ts` | Salary / OT / payday cycle dates |
| `src/utils/dayLog.ts` | Pick-dates calendar: tap / hold states, quick buttons, totals, old-entry migration |
| `src/utils/validation.ts` | Input parsing & error messages |
| `src/utils/migrate.ts` | Upgrades settings saved by older versions |
| `src/hooks/usePayrollForm.ts` | Raw form strings → validated input → result (live) |
| `src/hooks/useTab.ts` | Active tab (URL hash + localStorage) |
| `src/hooks/useMotion.ts` | Number tween + tap "pop" (respects reduced motion) |
| `src/components/` | UI only (no payroll maths) |

## How pay is calculated (formula basis)

Everything is **hours × hourly rate × multiplier**:

| Item | Formula (defaults) |
|---|---|
| Hourly rate | 12 × 3000 ÷ (52 × 44) = 15.7343 |
| Weekday OT | hrs × hourly × 1.5 (e.g. 6 h = 141.61) |
| Saturday shift | 8.75 h × hourly × 1.5 = 206.51 |
| Sunday / rest day | 8.75 h × hourly × 2 = 275.35 |
| Public holiday worked | same as Sunday: 275.35, on its own "Public holiday 2x" line |
| Shift allowance | $15 × (normal + Saturday + Sunday + public-holiday shifts) |
| CPF | floor(20% × gross) |
| Net | gross − CPF − MBF 5.00 − Mendaki 5.00 |

Default month (22 normal shifts, no OT): gross 3430.00, CPF 686, net 2734.00.

The app previously also offered a "payslip-calibrated" basis; it was removed. Saved settings from that
version still load (the payslip block is dropped).

## Pick dates mode

The calendar is the OT cycle (14th of the previous month → 13th of the payout month).

| Day | Tap cycles through | Counts as |
|---|---|---|
| Weekday | off → worked → +1h OT → off (short OT = Settings "OT hours (short)", default 1) | 1 normal shift (+ short OT hours) |
| Sat / Sun | off ↔ worked | 1 Saturday / Sunday OT shift |
| Any day, **hold ~450ms** | opens the day menu (below) | depends on the option chosen |

**Hold menu** (opens above the day; closes on an outside tap, Escape, scroll or the × button):

- **+1¼ hr OT** (long OT = Settings "OT hours (long)", default 1.25). Weekdays only; disabled on Sat/Sun. Toggles the day to worked + long OT hours, counted as 1 normal shift.
- **Public holiday (2x)**. Toggles "public holiday worked" (blue, "PH") on any day. Counts as 1 public-holiday shift, paid like a Sunday, not as a normal shift.
- **Clear day**. Shown only when the day already has a state.

Tapping a day in the PH or long-OT state clears it to off. Choosing the option a day already has also clears it. In Pick dates mode "Normal shifts worked" is locked and auto-counted. Quick buttons:
All weekdays worked, All Sundays, All Saturdays, Clear cycle. Switching back to "Enter totals" copies the
calendar totals into the typed fields (which include "Public holiday shifts").

**Assumption:** normal shifts are counted over the same 14th → 13th window as OT.

Old saved calendars are migrated: entries without a status (weekday = OT hours) and `ot` entries with free
hours map to whichever OT state (1h / 1.25h) is closest; weekend entries become worked.

## Target mode

Finds the minimum OT (Sundays → Saturdays → weekday OT) to reach a net goal. The base is fixed from Settings
and ignores the Calculator tab and the calendar: 22 normal shifts (`targetNormalShifts`) with basic + transport +
shift allowance, no OT, weekends or public holidays, and deductions = CPF + the fixed Settings deductions only.
Public holidays are never added, and PHs already entered on the calendar are not in the base. Each added
Saturday or Sunday also earns one shift allowance; weekday OT hours do not.

## Layout

Summary tiles (gross, CPF, other deductions, net) stay pinned at the top. Tabs: Calculator, Breakdown, Target,
Settings. Bottom tab bar on phones, left sidebar on desktop (≥1024px).
