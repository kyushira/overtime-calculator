import type { Mode } from './navModel';

/** Segmented Pay | Car | Tax switch in the header. Each option is a 44px button with aria-pressed. */
export function PayCarSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const options: { id: Mode; label: string }[] = [
    { id: 'pay', label: 'Pay' },
    { id: 'car', label: 'Car' },
    { id: 'tax', label: 'Tax' },
  ];
  return (
    <div role="group" aria-label="App mode" className="flex shrink-0 rounded-lg border border-slate-200 bg-page p-0.5">
      {options.map((o) => {
        const on = mode === o.id;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={`min-h-11 min-w-12 rounded-md px-3 text-sm font-semibold transition-colors duration-150 ${
              on ? 'bg-accent-bg text-accent shadow-glow-accent' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
