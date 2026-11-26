import { useLayoutEffect, useRef, useState } from 'react';
import { inputClass } from '../ui';
import { amountCaretAfterFormat, formatAmountInput, numText, parseAmountInput } from './fields';

interface Props {
  /** Current amount. null and 0 both show blank. */
  value: number | null;
  /** Called with the parsed amount, or null when the field is blank or invalid. */
  onChange: (v: number | null) => void;
  prefix?: string;
  ariaLabel: string;
  /** id of a sibling element that describes the input. */
  describedBy?: string;
}

/**
 * Amount field with thousand separators (e.g. 90,000). A text input with inputMode=decimal,
 * since type=number cannot show commas. The caret stays where the user is typing.
 */
export function AmountInput({ value, onChange, prefix, ariaLabel, describedBy }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => formatAmountInput(numText(value)));
  // Caret to restore after the next render, set only when formatting changed the typed text.
  const pendingCaret = useRef<number | null>(null);

  // The parent changed the value from outside (e.g. "Use suggestion"): show it. A value the user
  // just typed already matches the text, so typing like "1." is not rewritten.
  const shown = parseAmountInput(text) ?? 0;
  if ((value ?? 0) !== shown) {
    setText(formatAmountInput(numText(value)));
  }

  useLayoutEffect(() => {
    if (pendingCaret.current !== null && ref.current) {
      ref.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  });

  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
          {prefix}
        </span>
      )}
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={text}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        onChange={(e) => {
          const raw = e.target.value;
          const formatted = formatAmountInput(raw);
          if (formatted !== raw) {
            pendingCaret.current = amountCaretAfterFormat(raw, e.target.selectionStart ?? raw.length, formatted);
          }
          setText(formatted);
          onChange(parseAmountInput(formatted));
        }}
        className={`${inputClass()} ${prefix ? 'pl-10' : ''}`}
      />
    </div>
  );
}
