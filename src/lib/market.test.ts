import { describe, it, expect } from 'vitest';
import { parseMarketIndex, splitByBudget } from './market';

const FEED = {
  asOf: '2026-11-14 06:12:00',
  dealers: 1650,
  listings: 135500,
  units: [
    { label: 'F-150', price: 43000, n: 412 },
    { label: 'Civic', price: 24500, n: 388 },
    { label: 'RAV4', price: 31000, n: 301 },
  ],
};

describe('parseMarketIndex', () => {
  it('reads a well-formed feed', () => {
    expect(parseMarketIndex(FEED)).toEqual({
      asOf: '2026-11-14',
      dealers: 1650,
      units: [
        { label: 'F-150', price: 43000, listings: 412 },
        { label: 'Civic', price: 24500, listings: 388 },
        { label: 'RAV4', price: 31000, listings: 301 },
      ],
    });
  });

  it('drops rows it cannot trust and keeps the rest', () => {
    const index = parseMarketIndex({
      units: [
        { label: 'Civic', price: '24500', n: 'many' },
        { label: '', price: 20000, n: 5 },
        { label: 'Corolla', price: 0, n: 5 },
        { label: 'Escape', price: Number.NaN, n: 5 },
        { label: 42, price: 20000, n: 5 },
        null,
        'F-150',
      ],
    });
    expect(index.units).toEqual([{ label: 'Civic', price: 24500, listings: 0 }]);
  });

  it('turns anything that is not the feed into an empty index', () => {
    const empty = { asOf: '', dealers: 0, units: [] };
    for (const body of [null, undefined, 'oops', 7, [], {}, { units: 'none' }, { asOf: 'yesterday', dealers: -3 }]) {
      expect(parseMarketIndex(body)).toEqual(empty);
    }
  });
});

describe('splitByBudget', () => {
  const { units } = parseMarketIndex(FEED);

  it('puts a unit priced exactly at the budget inside it', () => {
    const { within, over } = splitByBudget(units, 31000);
    expect(within.map((unit) => unit.label)).toEqual(['RAV4', 'Civic']);
    expect(over.map((unit) => unit.label)).toEqual(['F-150']);
  });

  it('starts each side nearest the budget without reordering the input', () => {
    expect(splitByBudget(units, 100000).within.map((unit) => unit.label)).toEqual(['F-150', 'RAV4', 'Civic']);
    expect(splitByBudget(units, 0).over.map((unit) => unit.label)).toEqual(['Civic', 'RAV4', 'F-150']);
    expect(units.map((unit) => unit.label)).toEqual(['F-150', 'Civic', 'RAV4']);
  });

  it('handles a budget below everything', () => {
    const { within, over } = splitByBudget(units, 5000);
    expect(within).toEqual([]);
    expect(over).toHaveLength(3);
  });
});
