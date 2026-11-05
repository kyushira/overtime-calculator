import { useState, type CSSProperties, type ReactNode } from 'react';

/* Shared class strings for buttons (8px radius controls, pills fully rounded). */
export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-white transition duration-150 ease-out hover:bg-slate-800 active:scale-[0.97]';
export const btnOutline =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition duration-150 ease-out hover:border-slate-300 hover:bg-slate-50 active:scale-[0.97]';
export const btnGhost =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition duration-150 ease-out hover:bg-slate-100 hover:text-slate-900 active:scale-[0.97]';
export const pillBtn =
  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition duration-150 ease-out active:scale-[0.96]';

/** Small uppercase, letter-spaced gray section label. */
export function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400 ${className}`}>{children}</div>;
}

// Cards only fade up during the first moments after page load, not on every tab switch.
const BOOT = typeof performance !== 'undefined' ? performance.now() : 0;
const isBooting = () => typeof performance !== 'undefined' && performance.now() - BOOT < 1200;

export function Card({ title, subtitle, actions, children, className = '', index = 0, flush = false }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Stagger position for the first-load fade-up. */
  index?: number;
  /** No body padding (e.g. edge-to-edge tables); the header keeps its padding. */
  flush?: boolean;
}) {
  const [animate] = useState(isBooting);
  return (
    <section
      style={{ '--i': index } as CSSProperties}
      className={`min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[var(--shadow-card)] ${flush ? '' : 'p-4 sm:p-5'} ${animate ? 'anim-fade-up' : ''} ${className}`}
    >
      {(title || actions) && (
        <header className={`mb-4 flex flex-wrap items-start justify-between gap-2 ${flush ? 'px-4 pt-4 sm:px-5 sm:pt-5' : ''}`}>
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <span role="alert" className="anim-slide-in mt-1 block text-xs text-bad">{children}</span>;
}

export function Field({ label, hint, error, children, className = '' }: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{label}</span>
      {children}
      {error ? <ErrorText key={error}>{error}</ErrorText> : hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const inputBase =
  'w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition duration-150 ease-out placeholder:text-slate-400 focus:ring-[3px]';

export function inputClass(error?: string) {
  return `${inputBase} ${error ? 'border-bad/60 focus:ring-bad/15' : 'border-slate-200 hover:border-slate-300 focus:border-slate-400 focus:ring-slate-900/[0.06]'}`;
}

/** Number input backed by a string so users can type freely; parent validates. */
export function NumInput({ value, onChange, error, step = 'any', placeholder, suffix, prefix, ariaLabel }: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  step?: string;
  placeholder?: string;
  suffix?: string;
  prefix?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">{prefix}</span>}
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={value}
        placeholder={placeholder ?? '0'}
        aria-label={ariaLabel}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass(error)} ${prefix ? 'pl-10' : ''} ${suffix ? 'pr-14' : ''}`}
      />
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">{suffix}</span>}
    </div>
  );
}

/** Segmented control with a sliding active indicator. */
export function Segmented<T extends string>({ value, options, onChange, ariaLabel, size = 'md' }: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
  size?: 'sm' | 'md';
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="relative flex w-full rounded-lg bg-slate-100 p-1">
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-md bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] ring-1 ring-slate-200 transition-transform duration-200 ease-out"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${idx * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`relative z-10 flex-1 whitespace-nowrap rounded-md px-2 font-medium transition-colors duration-200 ${size === 'sm' ? 'py-1 text-xs' : 'py-1.5 text-sm'} ${
            value === o.value ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export type Tone = 'slate' | 'green' | 'amber' | 'red' | 'indigo' | 'blue';

const PILL: Record<Tone, { bg: string; text: string; dot: string }> = {
  slate: { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' },
  green: { bg: 'bg-good-bg', text: 'text-good', dot: 'bg-good' },
  amber: { bg: 'bg-sat-bg', text: 'text-sat', dot: 'bg-sat' },
  red: { bg: 'bg-bad-bg', text: 'text-bad', dot: 'bg-bad' },
  indigo: { bg: 'bg-accent-bg', text: 'text-accent', dot: 'bg-accent' },
  blue: { bg: 'bg-blue-bg', text: 'text-blue', dot: 'bg-blue' },
};

/** Status pill: pale tint, saturated text, leading dot. */
export function Badge({ tone = 'slate', children, dot = true }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  const t = PILL[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${t.bg} ${t.text}`}>
      {dot && <span aria-hidden className={`size-1.5 rounded-full ${t.dot}`} />}
      {children}
    </span>
  );
}
