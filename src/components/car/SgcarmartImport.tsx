import { useRef, useState, type FormEvent } from 'react';
import { ChevronDown, Link2 } from 'lucide-react';
import {
  fieldLabel,
  type ImportedListing,
  importErrorMessage,
  listingFromParse,
  listingFromResponse,
  missingMessage,
} from '../../utils/carImport';
import { money, moneyWhole, num } from '../../utils/format';
import { isAllowedSgcarmartUrl, LISTING_FIELDS, parseListingText, type ListingField } from '../../utils/sgcarmart';
import { btnOutline, btnPrimary, Card, Field, inputClass, SectionLabel } from '../ui';

interface Props {
  /** Called with a successful import (from the URL or pasted text). The parent fills the form. */
  onImported: (listing: ImportedListing) => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; listing: ImportedListing }
  | { kind: 'error'; message: string };

const INVALID_LINK = 'Paste a sgcarmart.com listing link, for example https://www.sgcarmart.com/used-cars/info/…';
const NO_DETAILS = "Couldn't find any listing details in that text. Check the labels (Price, OMV, ARF, COE, Mileage) and try again.";

/** Read-only info chip: ARF, COE, model, year, mileage. The form has no inputs for these. */
function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-100 px-3 py-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="truncate text-[13px] font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

function infoChips(listing: ImportedListing) {
  const f = listing.fields;
  const chips: { label: string; value: string }[] = [];
  if (f.name !== undefined) chips.push({ label: 'Model', value: f.name });
  if (f.year !== undefined) chips.push({ label: 'Year', value: String(f.year) });
  if (f.mileage !== undefined) chips.push({ label: 'Mileage', value: `${num(f.mileage, 0)} km` });
  if (f.arf !== undefined) chips.push({ label: 'ARF', value: moneyWhole(f.arf) });
  if (f.coe !== undefined) chips.push({ label: 'COE', value: moneyWhole(f.coe) });
  return chips;
}

/** Import card: paste a sgcarmart link (or the listing text) to fill price and OMV. */
export function SgcarmartImport({ onImported }: Props) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [pasteText, setPasteText] = useState('');
  // Latest request wins: a slow earlier import must not overwrite a newer result.
  const requestId = useRef(0);

  const finish = (listing: ImportedListing) => {
    const readable = LISTING_FIELDS.length - listing.missing.length;
    if (readable === 0) {
      setStatus({ kind: 'error', message: "Couldn't read any details from that listing. Paste the listing text instead." });
      return;
    }
    setStatus({ kind: 'done', listing });
    onImported(listing);
  };

  async function importFromUrl(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const link = url.trim();
    if (!isAllowedSgcarmartUrl(link)) {
      setStatus({ kind: 'error', message: INVALID_LINK });
      return;
    }
    const id = ++requestId.current;
    setStatus({ kind: 'loading' });
    try {
      const res = await fetch(`/api/sgcarmart?url=${encodeURIComponent(link)}`);
      const body: unknown = await res.json().catch(() => null);
      if (id !== requestId.current) return;
      const code = typeof body === 'object' && body !== null ? String((body as { error?: unknown }).error ?? '') : '';
      if (!res.ok) {
        setStatus({ kind: 'error', message: importErrorMessage(res.status, code, res.headers.get('Retry-After')) });
        return;
      }
      const listing = listingFromResponse(body, link);
      if (!listing) {
        setStatus({ kind: 'error', message: importErrorMessage(502) });
        return;
      }
      finish(listing);
    } catch {
      if (id !== requestId.current) return;
      setStatus({ kind: 'error', message: importErrorMessage(0) });
    }
  }

  function importFromText() {
    const parsed = parseListingText(pasteText);
    const listing = listingFromParse(parsed);
    if (listing.missing.length === LISTING_FIELDS.length) {
      setStatus({ kind: 'error', message: NO_DETAILS });
      return;
    }
    requestId.current++;
    finish(listing);
  }

  const busy = status.kind === 'loading';
  const listing = status.kind === 'done' ? status.listing : null;
  const chips = listing ? infoChips(listing) : [];
  // Price and OMV are the two numbers the form takes; name/ARF/COE/year/mileage are shown above.
  const formMissing: ListingField[] = listing ? listing.missing.filter((m) => m === 'price' || m === 'omv') : [];
  const otherMissing: ListingField[] = listing ? listing.missing.filter((m) => m !== 'price' && m !== 'omv') : [];

  return (
    <Card title="Import from sgcarmart" subtitle="Paste a used-car listing link to fill in the price and OMV.">
      <form onSubmit={importFromUrl} className="space-y-3" noValidate>
        <Field label="Listing link">
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            placeholder="https://www.sgcarmart.com/used-cars/info/…"
            onChange={(e) => setUrl(e.target.value)}
            className={inputClass()}
          />
        </Field>
        <button type="submit" disabled={busy || url.trim() === ''} className={`${btnPrimary} min-h-11 w-full`}>
          <Link2 size={16} strokeWidth={1.5} aria-hidden /> {busy ? 'Importing…' : 'Import listing'}
        </button>
      </form>

      {/* One live region for every status: loading, success, and each error. */}
      <div aria-live="polite" className="mt-3 space-y-2 text-[13px]">
        {status.kind === 'loading' && <p className="text-slate-500">Fetching listing…</p>}
        {status.kind === 'error' && (
          <p role="alert" className="rounded-lg border border-bad/20 bg-bad-bg px-3 py-2 text-bad">
            {status.message}
          </p>
        )}
        {listing && (
          <>
            <p className="text-good">
              Imported{listing.fields.name ? ` ${listing.fields.name}` : ''}. Check the figures before you rely on them.
            </p>
            {(listing.fields.price !== undefined || listing.fields.omv !== undefined) && (
              <p className="text-slate-600">
                Filled in{' '}
                {[
                  listing.fields.price !== undefined ? `price ${money(listing.fields.price)}` : null,
                  listing.fields.omv !== undefined ? `OMV ${money(listing.fields.omv)}` : null,
                ]
                  .filter(Boolean)
                  .join(' and ')}
                .
              </p>
            )}
            {chips.length > 0 && (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {chips.map((c) => (
                  <li key={c.label} className="min-w-0">
                    <Chip label={c.label} value={c.value} />
                  </li>
                ))}
              </ul>
            )}
            {formMissing.map((m) =>
              m === 'price' ? (
                // The form keeps its price on a miss, so this must be seen, not just read.
                <p key={m} className="rounded-lg border border-sat bg-sat-bg px-3 py-2.5 text-[14px] font-semibold text-sat">
                  {missingMessage(m)}.
                </p>
              ) : (
                <p key={m} className="rounded-lg border border-sat/20 bg-sat-bg px-3 py-2 text-sat">
                  {missingMessage(m)}. OMV is cleared, so the 40% minimum applies until you enter it.
                </p>
              ),
            )}
            {otherMissing.length > 0 && (
              <p className="text-xs text-slate-500">Not on the listing: {otherMissing.map(fieldLabel).join(', ')}.</p>
            )}
          </>
        )}
      </div>

      <details className="group mt-4 border-t border-slate-200 pt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-accent">
          <ChevronDown size={16} strokeWidth={1.5} aria-hidden className="transition-transform group-open:rotate-180" />
          Paste listing text instead
        </summary>
        <div className="mt-3 space-y-3">
          <SectionLabel>Use this if the link will not load</SectionLabel>
          <Field label="Listing text" hint="Lines like “Price: S$47,800” or “OMV: S$33,419”. Name, year, ARF, COE and mileage are read too.">
            <textarea
              rows={5}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              className={inputClass()}
              spellCheck={false}
            />
          </Field>
          <button
            type="button"
            onClick={importFromText}
            disabled={pasteText.trim() === ''}
            className={`${btnOutline} min-h-11 w-full`}
          >
            Use pasted text
          </button>
        </div>
      </details>
    </Card>
  );
}
