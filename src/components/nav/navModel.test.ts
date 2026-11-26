import { describe, expect, it } from 'vitest';
import { BAR_TABS, isBarTab, modeOf, nextLastPayTab, parseBarTab, summaryVariant } from './navModel';
import { parseTab, TABS } from '../../hooks/useTab';

describe('modeOf', () => {
  it('car and tax are their own modes; every other tab (including settings) is pay mode', () => {
    expect(modeOf('car')).toBe('car');
    expect(modeOf('tax')).toBe('tax');
    for (const t of TABS.filter((t) => t !== 'car' && t !== 'tax')) expect(modeOf(t)).toBe('pay');
  });
});

describe('bottom bar tabs', () => {
  it('are exactly the four pay tabs, no settings or car', () => {
    expect([...BAR_TABS]).toEqual(['calculator', 'breakdown', 'target', 'months']);
    expect(isBarTab('settings')).toBe(false);
    expect(isBarTab('car')).toBe(false);
    expect(isBarTab('months')).toBe(true);
  });
});

describe('nextLastPayTab', () => {
  it('remembers the pay tab, ignores settings and car', () => {
    expect(nextLastPayTab('target', 'calculator')).toBe('target');
    expect(nextLastPayTab('settings', 'months')).toBe('months');
    expect(nextLastPayTab('car', 'breakdown')).toBe('breakdown');
    expect(nextLastPayTab('tax', 'months')).toBe('months');
  });
});

describe('parseBarTab', () => {
  it('accepts the four pay tabs and falls back to calculator otherwise', () => {
    expect(parseBarTab('breakdown')).toBe('breakdown');
    expect(parseBarTab('settings')).toBe('calculator');
    expect(parseBarTab('car')).toBe('calculator');
    expect(parseBarTab(null)).toBe('calculator');
    expect(parseBarTab(42)).toBe('calculator');
  });
});

describe('summaryVariant', () => {
  it('full grid on calculator, strip on breakdown/target/months, none on settings and car', () => {
    expect(summaryVariant('calculator')).toBe('full');
    expect(summaryVariant('breakdown')).toBe('strip');
    expect(summaryVariant('target')).toBe('strip');
    expect(summaryVariant('months')).toBe('strip');
    expect(summaryVariant('settings')).toBe('none');
    expect(summaryVariant('car')).toBe('none');
    expect(summaryVariant('tax')).toBe('none');
  });
});

describe('parseTab still handles old links', () => {
  it('deep links and legacy hash forms resolve to the same tab ids', () => {
    expect(parseTab('#settings')).toBe('settings');
    expect(parseTab('#/car')).toBe('car');
    expect(parseTab('#tax')).toBe('tax');
    expect(parseTab('#Months')).toBe('months');
    expect(parseTab('#nope')).toBeNull();
  });
});
