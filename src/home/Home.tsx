'use client';

import { ChevronRight, Car, CreditCard, FileText, HeartPulse, Landmark, Layers, PiggyBank, Repeat, ScanLine, Wallet, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ThemeToggle } from '../components/ThemeToggle';
import { useTheme } from '../hooks/useTheme';
import { HOME_MODULES, legacyHashTarget, type HomeModule, type ModuleIconName } from './modules';
import { tileTint } from './tints';

const ICONS: Record<ModuleIconName, LucideIcon> = {
  Wallet,
  Car,
  FileText,
  PiggyBank,
  Landmark,
  Layers,
  CreditCard,
  Repeat,
  HeartPulse,
  ScanLine,
};

/** Shared by the icon tile and the title so a coming-soon row dims both together. */
function RowLead({ module, dim }: { module: HomeModule; dim: boolean }) {
  const Icon = ICONS[module.icon];
  const tint = tileTint(module.id);
  return (
    <>
      <span className={`grid size-[52px] shrink-0 place-items-center rounded-xl ${tint.fill} ${dim ? 'opacity-[0.45]' : tint.glow}`}>
        <Icon size={24} strokeWidth={1.75} aria-hidden className="text-home-icon" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`truncate text-[18px] font-semibold leading-tight text-home-title ${dim ? 'opacity-[0.45]' : ''}`}>
            {module.title}
          </span>
          {dim && (
            <span className="shrink-0 rounded-full bg-home-tile px-2 py-0.5 text-[11px] font-semibold leading-4 text-home-sub">Soon</span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-sm text-home-sub">{module.subtitle}</span>
      </span>
    </>
  );
}

function ModuleRow({ module }: { module: HomeModule }) {
  if (module.status === 'soon' || !module.href) {
    return (
      <div aria-disabled="true" className="flex min-h-[44px] items-center gap-4 px-4 py-3">
        <RowLead module={module} dim />
      </div>
    );
  }
  return (
    <Link href={module.href} className="flex min-h-[44px] items-center gap-4 px-4 py-3 transition-colors duration-150 hover:bg-slate-100 active:bg-slate-100">
      <RowLead module={module} dim={false} />
      <ChevronRight size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-home-chevron" />
    </Link>
  );
}

/** Module picker: the app's front door. Each active module is its own route. */
export function Home() {
  const router = useRouter();
  const theme = useTheme();

  // Old single-page links (#car, #breakdown, ...) forward to the matching route.
  useEffect(() => {
    const target = legacyHashTarget(window.location.hash);
    if (target) router.replace(target);
  }, [router]);

  return (
    <div className="app-bg min-h-screen bg-home-page text-home-title">
      <header className="mx-auto flex max-w-xl items-center gap-2 px-4 pt-4 pb-2">
        <h1 className="min-w-0 flex-1 truncate text-[22px] font-bold text-home-title">Finance</h1>
        <ThemeToggle pref={theme.pref} onCycle={theme.cyclePref} />
      </header>
      <main className="mx-auto max-w-xl px-4 pt-3 pb-10">
        <ul className="overflow-hidden rounded-3xl bg-surface shadow-home-card dark:border dark:border-slate-200">
          {HOME_MODULES.map((m) => (
            <li key={m.id} className="border-b border-home-divider last:border-b-0">
              <ModuleRow module={m} />
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
