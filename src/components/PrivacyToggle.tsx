import { Eye, EyeOff } from 'lucide-react';

/** Header toggle that masks the pay figures (summary tiles, compact row). State lives in App. */
export function PrivacyToggle({ hidden, onToggle, className = '' }: { hidden: boolean; onToggle: () => void; className?: string }) {
  const label = hidden ? 'Show amounts' : 'Hide amounts';
  const Icon = hidden ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={hidden}
      title={label}
      className={`grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg text-slate-500 transition duration-150 ease-out hover:bg-slate-100 hover:text-slate-900 active:scale-95 ${className}`}
    >
      <Icon size={18} strokeWidth={1.5} aria-hidden />
    </button>
  );
}
