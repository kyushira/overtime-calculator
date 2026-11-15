import { describe, expect, it } from 'vitest';
import {
  MAX_SAVED_CARS,
  SAVED_CARS_BACKUP_KEY,
  SAVED_CARS_KEY,
  addCar,
  loadCars,
  migrate,
  removeCar,
  saveCars,
  type SavedCar,
  type StorageLike,
} from './savedCars';

class MemoryStorage implements StorageLike {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  raw(): string | undefined {
    return this.data.get(SAVED_CARS_KEY);
  }
  seed(value: string): void {
    this.data.set(SAVED_CARS_KEY, value);
  }
}

const NOW = new Date('2026-11-15T04:00:00.000Z');
const AUDI_LINK = 'https://www.sgcarmart.com/used-cars/info/audi-a4-20a-tfsi-1551328/';
const HONDA_LINK = 'https://www.sgcarmart.com/used-cars/info/honda-vezel-15a-x-1551624/';

const audi = {
  name: 'Audi A4 2.0A TFSI S-tronic',
  link: AUDI_LINK,
  price: 47800,
  omv: 33419,
  arf: 38787,
  coe: 33900,
  year: 2018,
  mileage: 69030,
};

describe('addCar', () => {
  it('appends a car with an id and savedAt timestamp and leaves the input list untouched', () => {
    const before: SavedCar[] = [];
    const after = addCar(before, audi, { now: NOW, id: 'id-1' });
    expect(after).toEqual([{ ...audi, id: 'id-1', savedAt: NOW.toISOString() }]);
    expect(before).toHaveLength(0);
  });

  it('does not add a second entry for a link that is already saved', () => {
    const once = addCar([], audi, { now: NOW, id: 'id-1' });
    const twice = addCar(once, audi, { now: NOW, id: 'id-2' });
    expect(twice).toHaveLength(1);
    expect(twice[0].id).toBe('id-1');
  });

  it('keeps cars that have no link', () => {
    const manual = addCar([], { name: 'Manual entry', price: 1000 }, { now: NOW, id: 'm1' });
    expect(manual[0].link).toBeUndefined();
  });

  it('drops a link that is not an allowed sgcarmart URL', () => {
    const car = addCar([], { ...audi, link: 'javascript:alert(1)' }, { now: NOW, id: 'x' });
    expect(car[0].link).toBeUndefined();
  });

  it('generates a non-empty id when none is supplied', () => {
    const [car] = addCar([], audi, { now: NOW });
    expect(car.id.length).toBeGreaterThan(0);
  });
});

describe('addCar link normalisation and cap', () => {
  it('treats a default-port and upper-case spelling of a saved link as the same listing', () => {
    const once = addCar([], audi, { now: NOW, id: 'id-1' });
    const twice = addCar(once, { ...audi, link: 'https://WWW.SGCARMART.COM:443/used-cars/info/audi-a4-20a-tfsi-1551328/' }, { now: NOW, id: 'id-2' });
    expect(twice).toHaveLength(1);
  });

  it('stores the link in its normalised href form', () => {
    const [car] = addCar([], { ...audi, link: 'https://WWW.SGCARMART.COM:443/used-cars/info/x/#gallery' }, { now: NOW, id: 'n' });
    expect(car.link).toBe('https://www.sgcarmart.com/used-cars/info/x/#gallery');
  });

  it(`refuses to add past ${MAX_SAVED_CARS} cars and returns the list unchanged`, () => {
    const full = Array.from({ length: MAX_SAVED_CARS }, (_, i) => ({ id: `c${i}`, name: `Car ${i}`, savedAt: NOW.toISOString() }));
    const next = addCar(full, { name: 'One too many', price: 1 }, { now: NOW, id: 'extra' });
    expect(next).toBe(full);
    expect(next).toHaveLength(MAX_SAVED_CARS);
  });

  it('caps a stored list at 200 cars on load', () => {
    const storage = new MemoryStorage();
    const cars = Array.from({ length: 250 }, (_, i) => ({ id: `c${i}`, name: `Car ${i}`, savedAt: NOW.toISOString() }));
    storage.seed(JSON.stringify({ version: 1, cars }));
    const loaded = loadCars(storage);
    expect(loaded).toHaveLength(200);
    expect(loaded[0].id).toBe('c0');
  });
});

describe('downPct', () => {
  it('stores the downpayment percent the car was saved at', () => {
    const [car] = addCar([], { ...audi, downPct: 30 }, { now: NOW, id: 'd' });
    expect(car.downPct).toBe(30);
  });

  it('round-trips through storage and drops an out-of-range value', () => {
    const storage = new MemoryStorage();
    storage.seed(
      JSON.stringify({
        version: 1,
        cars: [
          { id: 'ok', name: 'Ok', savedAt: NOW.toISOString(), downPct: 35.5 },
          { id: 'bad', name: 'Bad', savedAt: NOW.toISOString(), downPct: 150 },
        ],
      }),
    );
    const [ok, bad] = loadCars(storage);
    expect(ok.downPct).toBe(35.5);
    expect(bad.downPct).toBeUndefined();
  });

  it('loads a version-1 car saved before downPct existed', () => {
    const [car] = migrate({ version: 1, cars: [{ id: 'old', name: 'Old', savedAt: NOW.toISOString() }] }).cars;
    expect(car.downPct).toBeUndefined();
  });
});

describe('unknown-version document is never silently overwritten', () => {
  const FUTURE = JSON.stringify({ version: 99, cars: [{ id: 'f', name: 'Future', savedAt: NOW.toISOString(), extra: 'kept' }] });

  it('copies the raw newer document to the backup key before the first write', () => {
    const storage = new MemoryStorage();
    storage.seed(FUTURE);
    const next = addCar(loadCars(storage), audi, { now: NOW, id: 'id-1' });
    expect(saveCars(next, storage)).toBe(true);
    expect(storage.getItem(SAVED_CARS_BACKUP_KEY)).toBe(FUTURE);
    expect(JSON.parse(storage.raw() as string)).toEqual({ version: 1, cars: next });
  });

  it('keeps the first backup and refuses a write that would discard a different newer document', () => {
    const storage = new MemoryStorage();
    storage.seed(FUTURE);
    saveCars([], storage);
    const SECOND = JSON.stringify({ version: 98, cars: [] });
    storage.seed(SECOND);
    expect(saveCars([], storage)).toBe(false);
    expect(storage.getItem(SAVED_CARS_BACKUP_KEY)).toBe(FUTURE);
    expect(storage.raw()).toBe(SECOND);
  });

  it('may overwrite a newer document that is byte-identical to the backup already held', () => {
    const storage = new MemoryStorage();
    storage.seed(FUTURE);
    saveCars([], storage);
    storage.seed(FUTURE);
    expect(saveCars([], storage)).toBe(true);
    expect(storage.getItem(SAVED_CARS_BACKUP_KEY)).toBe(FUTURE);
  });

  it('does not write the main document when the backup cannot be stored', () => {
    const storage = new MemoryStorage();
    storage.seed(FUTURE);
    const failingBackup: StorageLike = {
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => {
        if (key === SAVED_CARS_BACKUP_KEY) throw new Error('QuotaExceededError');
        storage.setItem(key, value);
      },
    };
    expect(saveCars([], failingBackup)).toBe(false);
    expect(storage.raw()).toBe(FUTURE);
  });

  it('writes no backup for a current-version document', () => {
    const storage = new MemoryStorage();
    saveCars(addCar([], audi, { now: NOW, id: 'a' }), storage);
    saveCars([], storage);
    expect(storage.getItem(SAVED_CARS_BACKUP_KEY)).toBeNull();
  });
});

describe('removeCar', () => {
  it('removes only the car with the given id', () => {
    const list = [
      { ...audi, id: 'a', savedAt: NOW.toISOString() },
      { ...audi, id: 'b', savedAt: NOW.toISOString(), link: HONDA_LINK },
    ];
    expect(removeCar(list, 'a').map((c) => c.id)).toEqual(['b']);
    expect(removeCar(list, 'missing')).toHaveLength(2);
  });
});

describe('loadCars / saveCars', () => {
  it('round-trips through the versioned key', () => {
    const storage = new MemoryStorage();
    const cars = addCar([], audi, { now: NOW, id: 'id-1' });
    expect(saveCars(cars, storage)).toBe(true);
    expect(JSON.parse(storage.raw() as string)).toEqual({ version: 1, cars });
    expect(loadCars(storage)).toEqual(cars);
  });

  it('uses the carcalc.cars.v1 key', () => {
    expect(SAVED_CARS_KEY).toBe('carcalc.cars.v1');
  });

  it('returns an empty list when nothing is stored', () => {
    expect(loadCars(new MemoryStorage())).toEqual([]);
  });

  it.each([
    'not json at all',
    '{"version":1,"cars":',
    '[]]',
    'null',
    '42',
    '"just a string"',
    '{"cars":"nope"}',
    '{"version":99,"cars":[{"id":"x"}]}',
  ])('tolerates garbage stored value %j', (garbage) => {
    const storage = new MemoryStorage();
    storage.seed(garbage);
    const loaded = loadCars(storage);
    expect(Array.isArray(loaded)).toBe(true);
    expect(loaded.every((c) => typeof c.name === 'string')).toBe(true);
  });

  it('returns an empty list for a version-99 document rather than guessing its shape', () => {
    const storage = new MemoryStorage();
    storage.seed(JSON.stringify({ version: 99, cars: [{ id: 'x', name: 'Future', savedAt: NOW.toISOString() }] }));
    expect(loadCars(storage)).toEqual([]);
  });

  it('returns an empty list when storage access throws', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(loadCars(throwing)).toEqual([]);
    expect(saveCars([], throwing)).toBe(false);
  });
});

describe('migrate', () => {
  it('accepts a bare array of cars (pre-versioned shape)', () => {
    const doc = migrate([{ id: 'a', name: 'Audi', price: 1, savedAt: NOW.toISOString() }]);
    expect(doc).toEqual({
      version: 1,
      cars: [{ id: 'a', name: 'Audi', price: 1, savedAt: NOW.toISOString() }],
    });
  });

  it('drops malformed entries and keeps valid ones', () => {
    const doc = migrate({
      version: 1,
      cars: [null, 'str', { name: '' }, { id: 'ok', name: 'Good', savedAt: NOW.toISOString() }],
    });
    expect(doc.cars.map((c) => c.id)).toEqual(['ok']);
  });

  it('coerces bad numbers to undefined and rejects absurd years', () => {
    const doc = migrate({
      version: 1,
      cars: [
        {
          id: 'n',
          name: 'Numbers',
          savedAt: NOW.toISOString(),
          price: '47800',
          omv: -5,
          arf: Number.NaN,
          coe: 33900,
          year: 1066,
          mileage: 69030,
        },
      ],
    });
    const [car] = doc.cars;
    expect(car.price).toBeUndefined();
    expect(car.omv).toBeUndefined();
    expect(car.arf).toBeUndefined();
    expect(car.year).toBeUndefined();
    expect(car.coe).toBe(33900);
    expect(car.mileage).toBe(69030);
  });

  it('strips a non-allowlisted link', () => {
    const doc = migrate({
      version: 1,
      cars: [{ id: 'l', name: 'Phish', link: 'https://sgcarmart.com.evil.com/x', savedAt: NOW.toISOString() }],
    });
    expect(doc.cars[0].link).toBeUndefined();
  });

  it('returns an empty document for unknown input', () => {
    expect(migrate(undefined)).toEqual({ version: 1, cars: [] });
    expect(migrate({ foo: 'bar' })).toEqual({ version: 1, cars: [] });
  });
});
