import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { THEME_LABEL, type ThemePref } from '../utils/theme';

const ICON: Record<ThemePref, LucideIcon> = { auto: Monitor, light: Sun, dark: Moon };

/** Header quick toggle: cycles auto → light → dark. Shares state via the App-level useTheme. */
export function ThemeToggle({ pref, onCycle, className = '' }: { pref: ThemePref; onCycle: () => void; className?: string }) {
  const Icon = ICON[pref];
  const label = THEME_LABEL[pref];
  return (
    <button
      type="button"
      onClick={onCycle}
      aria-label={`Theme: ${label}. Switch theme`}
      title={`Theme: ${label}`}
      className={`grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg text-slate-500 transition duration-150 ease-out hover:bg-slate-100 hover:text-slate-900 active:scale-95 ${className}`}
    >
      <Icon size={18} strokeWidth={1.5} aria-hidden />
    </button>
  );
}
