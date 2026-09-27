import { describe, it, expect } from 'vitest';
import {
  availableDesjardinsRates,
  desjardinsReserveFor,
  desjardinsMaxTerm,
  bracketFor,
} from './desjardins';

describe('bracketFor', () => {
  it('returns null below the $7,500 table floor', () => {
    expect(bracketFor(7499.99)).toBeNull();
    expect(bracketFor(0)).toBeNull();
  });

  it('places amounts in the right bracket', () => {
    expect(bracketFor(7500)?.id).toBe('b7500');
    expect(bracketFor(19999)?.id).toBe('b15000');
    expect(bracketFor(20000)?.id).toBe('b20000');
    expect(bracketFor(74999)?.id).toBe('b50000');
    expect(bracketFor(75000)?.id).toBe('b75000');
    expect(bracketFor(150000)?.id).toBe('b75000');
  });
});

describe('desjardinsMaxTerm', () => {
  it('follows the sheet amortization table', () => {
    expect(desjardinsMaxTerm(2026)).toBe(96);
    expect(desjardinsMaxTerm(2021)).toBe(84);
    expect(desjardinsMaxTerm(2020)).toBe(72);
    expect(desjardinsMaxTerm(2019)).toBe(60);
    expect(desjardinsMaxTerm(2018)).toBe(48);
    expect(desjardinsMaxTerm(2016)).toBe(36);
    expect(desjardinsMaxTerm(2015)).toBe(0);
  });
});

describe('availableDesjardinsRates — reserve gating', () => {
  it('offers nothing below the $7,500 table floor', () => {
    expect(availableDesjardinsRates(7499, 2024, 60)).toEqual([]);
  });

  it('offers nothing for pre-2016 models', () => {
    expect(availableDesjardinsRates(30000, 2015, 60)).toEqual([]);
  });

  it('offers nothing when the term exceeds the year cap', () => {
    // 2021 caps at 84 months
    expect(availableDesjardinsRates(30000, 2021, 96)).toEqual([]);
    expect(availableDesjardinsRates(30000, 2021, 84).length).toBeGreaterThan(0);
  });

  it('gates the low fixed rates behind the $20,000 reserve floor', () => {
    const at18k = availableDesjardinsRates(18000, 2024, 60).map((r) => r.apr);
    expect(at18k).not.toContain(7.99);
    expect(at18k).not.toContain(8.49);
    expect(at18k).not.toContain(8.99);
    expect(at18k).toEqual([9.49, 9.99]);

    const at20k = availableDesjardinsRates(20000, 2024, 60).map((r) => r.apr);
    expect(at20k).toEqual([7.99, 8.49, 8.99, 9.49, 9.99]);
  });

  it('drops 9.49% and 9.99% at high amounts where their reserve is N/A', () => {
    const at60k = availableDesjardinsRates(60000, 2024, 60).map((r) => r.apr);
    expect(at60k).toEqual([6.95, 7.45, 7.99, 8.49, 8.99]);
    // 8.99 row is N/A at 75k+
    const at80k = availableDesjardinsRates(80000, 2024, 60).map((r) => r.apr);
    expect(at80k).toEqual([6.95, 7.45, 7.99, 8.49]);
  });

  it('gates promo rates behind the $25,000 reserve floor', () => {
    const at24999 = availableDesjardinsRates(24999, 2023, 60).map((r) => r.apr);
    expect(at24999).not.toContain(6.95);
    expect(at24999).not.toContain(7.45);

    const at25000 = availableDesjardinsRates(25000, 2023, 60);
    expect(at25000.map((r) => r.apr)).toEqual([6.95, 7.45, 7.99, 8.49, 8.99, 9.49, 9.99]);
    expect(at25000[0]).toMatchObject({ apr: 6.95, reservePct: 0.25, kind: 'promo' });
  });

  it('restricts promo eligibility by model year', () => {
    // 6.95% promo: 2021-2027 only; 7.45%: 2019-2027
    const at2020 = availableDesjardinsRates(30000, 2020, 60).map((r) => r.apr);
    expect(at2020).not.toContain(6.95);
    expect(at2020).toContain(7.45);
  });
});

describe('availableDesjardinsRates — term and year adjustments', () => {
  it('uses the extended APR column for 85+ month terms', () => {
    const at84 = availableDesjardinsRates(30000, 2024, 84).map((r) => r.apr);
    const at96 = availableDesjardinsRates(30000, 2024, 96).map((r) => r.apr);
    expect(at84).toEqual([6.95, 7.45, 7.99, 8.49, 8.99, 9.49, 9.99]);
    expect(at96).toEqual([6.95, 7.45, 8.99, 9.49, 9.99, 10.49, 10.99]);
  });

  it('keeps promo APRs flat at long terms ("no increase")', () => {
    const promos = availableDesjardinsRates(30000, 2024, 96).filter((r) => r.kind === 'promo');
    expect(promos.map((r) => r.apr)).toEqual([6.95, 7.45]);
  });

  it('applies the 2% premium to 2018-and-older models', () => {
    const rates = availableDesjardinsRates(30000, 2017, 36);
    // 7.99 base becomes 9.99 for a 2017 unit, same reserve as the 7.99 row
    expect(rates.map((r) => r.apr)).toContain(9.99);
    const r = rates.find((x) => x.apr === 9.99);
    expect(r?.reservePct).toBe(1.70);
  });
});

describe('desjardinsReserveFor', () => {
  it('returns the reserve for a backed rate', () => {
    expect(desjardinsReserveFor(7.99, 25000, 2024, 60)).toBe(1.15);
    expect(desjardinsReserveFor(6.95, 32000, 2023, 60)).toBe(0.75);
  });

  it('returns null for N/A rates and unknown rates', () => {
    // 7.99 has no reserve below $20k
    expect(desjardinsReserveFor(7.99, 18000, 2024, 60)).toBeNull();
    // 9.99 has no reserve above $50k
    expect(desjardinsReserveFor(9.99, 60000, 2024, 60)).toBeNull();
    // not a sheet rate at all
    expect(desjardinsReserveFor(5.49, 30000, 2024, 60)).toBeNull();
  });

  it('is Ontario-only', () => {
    expect(desjardinsReserveFor(7.99, 30000, 2024, 60, 'BC')).toBeNull();
    expect(availableDesjardinsRates(30000, 2024, 60, 'AB')).toEqual([]);
  });
});
