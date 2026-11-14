import type { LucideIcon } from 'lucide-react';
import type { Tab } from '../../hooks/useTab';

export interface BarItem {
  id: Tab;
  label: string;
  icon: LucideIcon;
}

/**
 * Mobile / tablet bottom bar for Pay mode: four tabs, 12px labels. The active tab gets a
 * tinted pill with a glow (dark) and accent text; no top indicator bar.
 */
export function BottomBar({ items, active, onSelect }: {
  items: BarItem[];
  active: Tab | null;
  onSelect: (id: Tab) => void;
}) {
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-surface pb-[max(6px,env(safe-area-inset-bottom))] shadow-[0_-1px_8px_rgba(0,0,0,0.03)] lg:hidden"
    >
      <div role="tablist" className="mx-auto grid max-w-xl grid-cols-4">
        {items.map((t) => {
          const on = active === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls="panel"
              onClick={() => onSelect(t.id)}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[12px] font-medium transition-colors duration-200 active:scale-95 ${
                on ? 'text-accent' : 'text-slate-400'
              }`}
            >
              <span
                className={`flex h-7 w-14 items-center justify-center rounded-full transition-[background-color,box-shadow] duration-200 ${
                  on ? 'bg-accent-bg shadow-glow-accent' : ''
                }`}
              >
                <Icon size={20} strokeWidth={1.5} aria-hidden />
              </span>
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
