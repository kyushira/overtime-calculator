import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from '../hooks/useTheme';
import { ThemeToggle } from './ThemeToggle';

/** Same header-button classes as the top bar in src/App.tsx (44px tap target). */
export const HEADER_BTN =
  'grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg transition duration-150 ease-out hover:bg-slate-100 hover:text-slate-900 active:scale-95';

/**
 * Top bar for a module route: Home button on the left, module title, theme toggle on the
 * right. Matches the App shell header (src/App.tsx), for modules outside the shared App.
 */
export function ModuleHeader({ title, blurb }: { title: string; blurb?: string }) {
  const theme = useTheme();
  return (
    <header className="border-b border-slate-200 bg-surface">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2 sm:gap-2.5 sm:px-6 lg:h-16 lg:gap-3 lg:py-0">
        <Link href="/" aria-label="Home" title="Home" className={`${HEADER_BTN} text-slate-500`}>
          <ChevronLeft size={22} strokeWidth={1.75} aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 id="view-title" className="truncate text-[15px] font-semibold text-slate-900 lg:text-lg">
            {title}
          </h1>
          {blurb && <p className="hidden truncate text-[13px] text-slate-500 sm:block">{blurb}</p>}
        </div>
        <div className="flex shrink-0 items-center">
          <ThemeToggle pref={theme.pref} onCycle={theme.cyclePref} />
        </div>
      </div>
    </header>
  );
}
