import { describe, expect, it } from 'vitest';
import {
  accountFromDraft,
  draftFrom,
  emptyDraft,
  emptySavings,
  newAccountId,
  parseSavings,
  SAVINGS_STORAGE_KEY,
  targetProgress,
  totalBalance,
  validateDraft,
  type Account,
  type AccountDraft,
} from './savingsModel';

const acct = (over: Partial<Account> = {}): Account => ({ id: 'a', name: 'Emergency', balance: 1000, ...over });

describe('SAVINGS_STORAGE_KEY', () => {
  it('is the agreed versioned key', () => {
    expect(SAVINGS_STORAGE_KEY).toBe('otcalc.savings.v1');
  });
});

describe('totalBalance', () => {
  it('sums every balance', () => {
    expect(totalBalance([acct({ balance: 1000 }), acct({ id: 'b', balance: 2500.5 })])).toBe(3500.5);
  });

  it('is zero for an empty list', () => {
    expect(totalBalance([])).toBe(0);
  });
});

describe('targetProgress', () => {
  it('gives the rounded percent of the goal', () => {
    expect(targetProgress(2500, 10000)).toBe(25);
    expect(targetProgress(1, 3)).toBe(33);
    expect(targetProgress(2, 3)).toBe(67);
  });

  it('clamps at 100 when the goal is exceeded', () => {
    expect(targetProgress(15000, 10000)).toBe(100);
  });

  it('clamps at 0 for a negative balance', () => {
    expect(targetProgress(-50, 10000)).toBe(0);
  });

  it('is null when there is no target', () => {
    expect(targetProgress(1000, undefined)).toBeNull();
    expect(targetProgress(1000, null)).toBeNull();
  });

  it('is null for a zero or negative target', () => {
    expect(targetProgress(1000, 0)).toBeNull();
    expect(targetProgress(1000, -5)).toBeNull();
  });

  it('is null for a non-finite target', () => {
    expect(targetProgress(1000, Number.NaN)).toBeNull();
  });
});

describe('parseSavings', () => {
  it('returns an empty list for missing or corrupt data', () => {
    expect(parseSavings(null)).toEqual(emptySavings());
    expect(parseSavings(undefined)).toEqual(emptySavings());
    expect(parseSavings('not json-ish')).toEqual(emptySavings());
    expect(parseSavings(42)).toEqual(emptySavings());
    expect(parseSavings({ v: 1 })).toEqual(emptySavings());
    expect(parseSavings({ v: 1, accounts: 'oops' })).toEqual(emptySavings());
  });

  it('keeps valid accounts and drops ones without a usable name or balance', () => {
    const parsed = parseSavings({
      v: 1,
      accounts: [
        { id: 'x', name: 'Holiday', balance: 300 },
        { id: 'y', name: '   ', balance: 10 },
        { id: 'z', name: 'No balance' },
        { id: 'w', name: 'Bad balance', balance: 'lots' },
        null,
      ],
    });
    expect(parsed.accounts).toEqual([{ id: 'x', name: 'Holiday', balance: 300 }]);
  });

  it('removes invalid optional fields but keeps the account', () => {
    const parsed = parseSavings({
      v: 1,
      accounts: [{ id: 'x', name: 'Car', balance: 5, target: -1, interestRate: 'high' }],
    });
    expect(parsed.accounts).toEqual([{ id: 'x', name: 'Car', balance: 5 }]);
  });

  it('keeps a valid target and interest rate', () => {
    const parsed = parseSavings({
      v: 1,
      accounts: [{ id: 'x', name: 'Goal', balance: 5, target: 10000, interestRate: 2.5 }],
    });
    expect(parsed.accounts[0]).toEqual({ id: 'x', name: 'Goal', balance: 5, target: 10000, interestRate: 2.5 });
  });

  it('gives a stable id to an account stored without one', () => {
    const parsed = parseSavings({ v: 1, accounts: [{ name: 'Old', balance: 1 }] });
    expect(parsed.accounts[0].id).toBe('legacy-0');
  });
});

const draft = (over: Partial<AccountDraft> = {}): AccountDraft => ({
  name: 'Holiday',
  balance: 500,
  target: null,
  rate: '',
  ...over,
});

describe('validateDraft', () => {
  it('accepts a name and balance alone', () => {
    expect(validateDraft(draft())).toEqual({});
  });

  it('requires a non-blank name', () => {
    expect(validateDraft(draft({ name: '   ' })).name).toBeDefined();
  });

  it('requires a balance', () => {
    expect(validateDraft(draft({ balance: null })).balance).toBeDefined();
  });

  it('accepts a zero balance', () => {
    expect(validateDraft(draft({ balance: 0 }))).toEqual({});
  });

  it('rejects a zero or negative target but allows a blank one', () => {
    expect(validateDraft(draft({ target: 0 })).target).toBeDefined();
    expect(validateDraft(draft({ target: -10 })).target).toBeDefined();
    expect(validateDraft(draft({ target: null }))).toEqual({});
  });

  it('rejects a negative rate but allows a blank or zero rate', () => {
    expect(validateDraft(draft({ rate: '-1' })).rate).toBeDefined();
    expect(validateDraft(draft({ rate: 'abc' })).rate).toBeDefined();
    expect(validateDraft(draft({ rate: '' }))).toEqual({});
    expect(validateDraft(draft({ rate: '0' }))).toEqual({});
  });
});

describe('accountFromDraft', () => {
  it('trims the name and leaves optional fields out when blank', () => {
    expect(accountFromDraft(draft({ name: '  Holiday  ' }), 'id1')).toEqual({ id: 'id1', name: 'Holiday', balance: 500 });
  });

  it('keeps a target and a numeric rate', () => {
    expect(accountFromDraft(draft({ target: 3000, rate: '2.5' }), 'id1')).toEqual({
      id: 'id1',
      name: 'Holiday',
      balance: 500,
      target: 3000,
      interestRate: 2.5,
    });
  });
});

describe('draftFrom', () => {
  it('round-trips an account through a draft', () => {
    const a: Account = { id: 'x', name: 'Goal', balance: 900, target: 4000, interestRate: 1.25 };
    expect(accountFromDraft(draftFrom(a), 'x')).toEqual(a);
  });

  it('gives a blank draft for an account without optional fields', () => {
    expect(draftFrom({ id: 'x', name: 'A', balance: 1 })).toEqual({ name: 'A', balance: 1, target: null, rate: '' });
  });

  it('empty draft is invalid until a name and balance are entered', () => {
    expect(Object.keys(validateDraft(emptyDraft())).sort()).toEqual(['balance', 'name']);
  });
});

describe('newAccountId', () => {
  it('returns distinct non-empty ids', () => {
    const a = newAccountId();
    const b = newAccountId();
    expect(a).not.toBe('');
    expect(a).not.toBe(b);
  });
});
