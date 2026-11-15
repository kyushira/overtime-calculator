import { parseIsoDate } from './coe';
import { isAllowedSgcarmartUrl } from './sgcarmart';

/**
 * Saved-cars storage for the car calculator, persisted as one versioned localStorage document.
 *
 * Every read is sanitised through migrate(): a corrupt or hand-edited value never reaches the UI
 * as anything but a list of well-formed cars. A document with a version this code does not know
 * reads as an empty list, but it is never overwritten silently: its raw text is copied to
 * SAVED_CARS_BACKUP_KEY before the first write, and a write that cannot keep it is refused.
 */

export const SAVED_CARS_KEY = 'carcalc.cars.v1';
export const SAVED_CARS_BACKUP_KEY = 'carcalc.cars.backup';
export const SAVED_CARS_VERSION = 1;
/** Upper bound on the list. A full list refuses new cars rather than dropping old ones. */
export const MAX_SAVED_CARS = 200;

const MAX_NAME_LENGTH = 200;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

export interface SavedCar {
  id: string;
  name: string;
  /** Only ever an allow-listed sgcarmart URL, in normalised (`URL.href`) form, or absent. */
  link?: string;
  price?: number;
  omv?: number;
  arf?: number;
  coe?: number;
  year?: number;
  mileage?: number;
  /** Downpayment as % of price when the car was saved. Absent on cars saved before it was recorded. */
  downPct?: number;
  /** COE expiry, ISO 'YYYY-MM-DD'. A loan on this car can't outlast it. Absent when no COE was recorded. */
  coeExpiry?: string;
  /** ISO-8601 timestamp. */
  savedAt: string;
}

export interface SavedCarsDocument {
  version: typeof SAVED_CARS_VERSION;
  cars: SavedCar[];
}

/** Input for addCar: everything except the generated id and timestamp. */
export type SavedCarInput = Omit<SavedCar, 'id' | 'savedAt'>;

/** The subset of the Web Storage API this module needs (lets tests use an in-memory fake). */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export interface AddCarOptions {
  now?: Date;
  id?: string;
}

function defaultStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanNumber(value: unknown, min: number, max = Number.POSITIVE_INFINITY): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : undefined;
}

function cleanCar(raw: unknown): SavedCar | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, MAX_NAME_LENGTH) : '';
  const id = typeof r.id === 'string' ? r.id : '';
  if (!name || !id) return undefined;
  const savedAt =
    typeof r.savedAt === 'string' && !Number.isNaN(Date.parse(r.savedAt))
      ? r.savedAt
      : new Date(0).toISOString();
  const car: SavedCar = { id, name, savedAt };
  if (typeof r.link === 'string' && isAllowedSgcarmartUrl(r.link)) car.link = normaliseLink(r.link);
  const price = cleanNumber(r.price, 0);
  const omv = cleanNumber(r.omv, 0);
  const arf = cleanNumber(r.arf, 0);
  const coe = cleanNumber(r.coe, 0);
  const year = cleanNumber(r.year, MIN_YEAR, MAX_YEAR);
  const mileage = cleanNumber(r.mileage, 0);
  const downPct = cleanNumber(r.downPct, 0, 100);
  if (price !== undefined) car.price = price;
  if (omv !== undefined) car.omv = omv;
  if (arf !== undefined) car.arf = arf;
  if (coe !== undefined) car.coe = coe;
  if (year !== undefined) car.year = year;
  if (mileage !== undefined) car.mileage = mileage;
  if (downPct !== undefined) car.downPct = downPct;
  if (typeof r.coeExpiry === 'string' && parseIsoDate(r.coeExpiry) !== null) car.coeExpiry = r.coeExpiry;
  return car;
}

/** The one spelling a listing link is stored and compared in. Only called on allow-listed URLs. */
function normaliseLink(link: string): string {
  return new URL(link).href;
}

function isUnknownVersion(parsed: unknown): boolean {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false;
  const version = (parsed as Record<string, unknown>).version;
  return version !== undefined && version !== SAVED_CARS_VERSION;
}

/**
 * Normalises any value into a valid v1 document. Accepts the current versioned shape or a bare
 * array of cars (the unversioned form). Unknown versions and unrecognised input become an empty list.
 * The list is capped at MAX_SAVED_CARS.
 */
export function migrate(raw: unknown): SavedCarsDocument {
  let list: unknown;
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'object' && raw !== null) {
    const r = raw as Record<string, unknown>;
    if (r.version !== undefined && r.version !== SAVED_CARS_VERSION) return { version: SAVED_CARS_VERSION, cars: [] };
    list = r.cars;
  }
  if (!Array.isArray(list)) return { version: SAVED_CARS_VERSION, cars: [] };
  const cars: SavedCar[] = [];
  for (const item of list) {
    if (cars.length >= MAX_SAVED_CARS) break;
    const car = cleanCar(item);
    if (car) cars.push(car);
  }
  return { version: SAVED_CARS_VERSION, cars };
}

/** Reads the saved cars. Missing, unreadable, or corrupt storage yields an empty list. */
export function loadCars(storage: StorageLike | undefined = defaultStorage()): SavedCar[] {
  if (!storage) return [];
  try {
    const text = storage.getItem(SAVED_CARS_KEY);
    if (text === null) return [];
    return migrate(JSON.parse(text)).cars;
  } catch {
    return [];
  }
}

/**
 * Keeps a newer-version document before a write replaces it. Its raw text goes to the backup key
 * the first time. A backup already holding different text is never overwritten, so the write is
 * refused instead. Returns false when the original cannot be kept.
 */
function preserveUnknownDocument(storage: StorageLike): boolean {
  const raw = storage.getItem(SAVED_CARS_KEY);
  if (raw === null) return true;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return true;
  }
  if (!isUnknownVersion(parsed)) return true;
  const backup = storage.getItem(SAVED_CARS_BACKUP_KEY);
  if (backup === null) {
    storage.setItem(SAVED_CARS_BACKUP_KEY, raw);
    return true;
  }
  return backup === raw;
}

/**
 * Writes the cars as a v1 document. Returns false if storage is unavailable or full, or if it holds
 * a newer-version document that could not be kept (see preserveUnknownDocument).
 */
export function saveCars(cars: SavedCar[], storage: StorageLike | undefined = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    if (!preserveUnknownDocument(storage)) return false;
    const doc = migrate({ version: SAVED_CARS_VERSION, cars });
    storage.setItem(SAVED_CARS_KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns a new list with the car appended. A car whose link is already saved is not added again,
 * and a full list (MAX_SAVED_CARS) takes no more. In both cases the list is returned unchanged.
 */
export function addCar(cars: SavedCar[], input: SavedCarInput, options: AddCarOptions = {}): SavedCar[] {
  if (cars.length >= MAX_SAVED_CARS) return cars;
  const link = input.link !== undefined && isAllowedSgcarmartUrl(input.link) ? normaliseLink(input.link) : undefined;
  if (link !== undefined && cars.some((c) => c.link === link)) return cars;
  const candidate = cleanCar({
    ...input,
    link,
    id: options.id ?? makeId(),
    savedAt: (options.now ?? new Date()).toISOString(),
  });
  return candidate ? [...cars, candidate] : cars;
}

/** Returns a new list without the car with the given id. */
export function removeCar(cars: SavedCar[], id: string): SavedCar[] {
  return cars.filter((c) => c.id !== id);
}
