import type { CarForm } from './car';
import { LISTING_FIELDS, type ListingField, type ListingFields, type ListingParseResult } from './sgcarmart';

/*
 * Pure mapping from an sgcarmart import (URL via the proxy, or pasted text) into the car form
 * and the saved-car draft. No I/O: the components do the fetch and call these.
 */

/** A listing read from the proxy or from pasted text. `link` is only set for URL imports. */
export interface ImportedListing {
  link?: string;
  fields: ListingFields;
  missing: ListingField[];
}

/** Listing details that are not form inputs (shown as chips, saved with the car). */
export interface ImportDraft {
  name?: string;
  link?: string;
  price?: number;
  omv?: number;
  arf?: number;
  coe?: number;
  year?: number;
  mileage?: number;
}

/** Only the fields the calculator actually uses are written to the form; others stay read-only info. */
export function importPatch(fields: ListingFields): Partial<CarForm> {
  const patch: Partial<CarForm> = {};
  if (fields.price !== undefined) {
    patch.price = String(fields.price);
    // Same rule as typing a price: keep the percentage, so the S$ downpayment moves with the price.
    patch.downMode = 'pct';
  }
  if (fields.omv !== undefined) patch.omv = String(fields.omv);
  return patch;
}

/** Wraps a pasted-text parse result (fields + missing) as an ImportedListing with no link. */
export function listingFromParse(parsed: ListingParseResult): ImportedListing {
  const { missing, ...fields } = parsed;
  return { fields, missing };
}

/** Reads a proxy success body. Returns null for anything that is not the expected shape. */
export function listingFromResponse(body: unknown, link: string): ImportedListing | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.ok !== true || typeof b.fields !== 'object' || b.fields === null || !Array.isArray(b.missing)) return null;
  const missing = b.missing.filter((m): m is ListingField => (LISTING_FIELDS as readonly string[]).includes(m as string));
  return { link, fields: b.fields as ListingFields, missing };
}

export function draftFromListing(listing: ImportedListing): ImportDraft {
  const f = listing.fields;
  const draft: ImportDraft = {};
  if (f.name !== undefined) draft.name = f.name;
  if (listing.link !== undefined) draft.link = listing.link;
  if (f.price !== undefined) draft.price = f.price;
  if (f.omv !== undefined) draft.omv = f.omv;
  if (f.arf !== undefined) draft.arf = f.arf;
  if (f.coe !== undefined) draft.coe = f.coe;
  if (f.year !== undefined) draft.year = f.year;
  if (f.mileage !== undefined) draft.mileage = f.mileage;
  return draft;
}

const FIELD_LABEL: Record<ListingField, string> = {
  name: 'name',
  year: 'year',
  price: 'price',
  omv: 'OMV',
  arf: 'ARF',
  coe: 'COE',
  mileage: 'mileage',
};

export function fieldLabel(field: ListingField): string {
  return FIELD_LABEL[field];
}

export function missingMessage(field: ListingField): string {
  return `Couldn't read ${FIELD_LABEL[field]}, fill manually`;
}

/** Friendly copy for a failed proxy call. `status` 0 means the request never got a response. */
export function importErrorMessage(status: number, code?: string, retryAfter?: string | null): string {
  if (status === 429) {
    const secs = Number.parseInt(retryAfter ?? '', 10);
    return Number.isFinite(secs) && secs > 0
      ? `sgcarmart is rate-limiting imports. Try again in ${secs} second${secs === 1 ? '' : 's'}.`
      : 'sgcarmart is rate-limiting imports. Try again in a few seconds.';
  }
  if (status === 400 || code === 'invalid_url') return "That isn't a sgcarmart.com listing link.";
  if (status === 404) return 'Importing from a link is not available in this build. Paste the listing text instead.';
  if (status === 504 || code === 'timeout') {
    return 'sgcarmart took too long to respond. Try again in a moment, or paste the listing text instead.';
  }
  if (status === 0) return "Couldn't reach the import service. Check your connection, or paste the listing text instead.";
  return "Couldn't load that listing from sgcarmart. Try again, or paste the listing text instead.";
}
