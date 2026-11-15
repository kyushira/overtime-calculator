import { describe, expect, it } from 'vitest';
import {
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
