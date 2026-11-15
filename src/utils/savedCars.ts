import { isAllowedSgcarmartUrl } from './sgcarmart';

/**
 * Saved-cars storage for the car calculator, persisted as one versioned localStorage document.
 *
 * Every read is sanitised through migrate(): a corrupt or hand-edited value never reaches the UI
 * as anything but a list of well-formed cars. Documents with a version this code does not know are
 * treated as empty rather than guessed at.
 */

export const SAVED_CARS_KEY = 'carcalc.cars.v1';
export const SAVED_CARS_VERSION = 1;

const MAX_NAME_LENGTH = 200;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

export interface SavedCar {
  id: string;
  name: string;
  /** Only ever an allow-listed sgcarmart URL, or absent. */
  link?: string;
  price?: number;
  omv?: number;
  arf?: number;
  coe?: number;
  year?: number;
  mileage?: number;
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
  if (typeof r.link === 'string' && isAllowedSgcarmartUrl(r.link)) car.link = r.link;
  const price = cleanNumber(r.price, 0);
  const omv = cleanNumber(r.omv, 0);
  const arf = cleanNumber(r.arf, 0);
  const coe = cleanNumber(r.coe, 0);
  const year = cleanNumber(r.year, MIN_YEAR, MAX_YEAR);
  const mileage = cleanNumber(r.mileage, 0);
  if (price !== undefined) car.price = price;
  if (omv !== undefined) car.omv = omv;
  if (arf !== undefined) car.arf = arf;
  if (coe !== undefined) car.coe = coe;
  if (year !== undefined) car.year = year;
  if (mileage !== undefined) car.mileage = mileage;
  return car;
}

/**
 * Normalises any value into a valid v1 document. Accepts the current versioned shape or a bare
 * array of cars (the unversioned form). Unknown versions and unrecognised input become an empty list.
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

/** Writes the cars as a v1 document. Returns false if storage is unavailable or full. */
export function saveCars(cars: SavedCar[], storage: StorageLike | undefined = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    const doc = migrate({ version: SAVED_CARS_VERSION, cars });
    storage.setItem(SAVED_CARS_KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns a new list with the car appended. A car whose link is already saved is not added again,
 * so the list is returned unchanged.
 */
export function addCar(cars: SavedCar[], input: SavedCarInput, options: AddCarOptions = {}): SavedCar[] {
  const link = input.link !== undefined && isAllowedSgcarmartUrl(input.link) ? input.link : undefined;
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
