import { describe, it, expect } from 'vitest';
import { calculateAutoLoan, getTermLimits, reverseCalculateAutoLoan, SUBPRIME_APR } from './calculator';
import { calculatorReducer } from './calculator-reducer';
import type { CalculatorState } from './calculator-reducer';
import type { CalculationInput } from './calculator';

const deal = (overrides: Partial<CalculationInput> = {}): CalculationInput => ({
  vehicleYear: 2016,
  vehiclePrice: 20000,
  tradeInValue: 0,
  lienAmount: 0,
  downPayment: 2000,
  apr: 9.99,
  termMonths: 36,
  licensingFee: 59,
  provinceCode: 'ON',
  vehicleCondition: 'used',
  ...overrides,
});

const stateFor = (inputs: CalculationInput, reverseMode = false): CalculatorState => ({
  inputs,
  results: calculateAutoLoan(inputs),
  showSchedule: false,
  adjustments: null,
  reverseMode,
  targetBiWeeklyPayment: 300,
  targetMonthlyPayment: 650,
  termByYear: {},
  downPaymentRaised: false,
});

it('subprime starts at 12.9% (owner, 2026-11-16)', () => {
  expect(SUBPRIME_APR).toBe(12.9);
});

describe('getTermLimits — subprime longer-term option', () => {
  it.each([
    [2016, 36, 60],
    [2017, 36, 48],
    [2018, 48, 60],
    [2019, 60, 78],
    [2020, 72, 78],
  ])('%i in ON: prime %i months, subprime %i months', (year, prime, subprime) => {
    const off = getTermLimits(year, 'used', 'ON', false);
    expect(off).toMatchObject({ subprimeAvailable: true, isSubprime: false, maxTermAllowed: prime, primeMaxTerm: prime, subprimeMaxTerm: subprime });
    const on = getTermLimits(year, 'used', 'ON', true);
    expect(on).toMatchObject({ isSubprime: true, maxTermAllowed: subprime });
  });

  it.each([2021, 2022, 2023, 2024, 2025])('%i: no subprime extension (prime already reaches it)', (year) => {
    const on = getTermLimits(year, 'used', 'ON', true);
    expect(on.subprimeAvailable).toBe(false);
    expect(on.isSubprime).toBe(false);
  });

  it('2023+ keeps its 96-month prime maximum; subprime never goes past 84', () => {
    expect(getTermLimits(2023, 'used', 'ON', true).maxTermAllowed).toBe(96);
  });

  it('pre-2016 vehicles are not eligible', () => {
    expect(getTermLimits(2015, 'used', 'ON', true).subprimeAvailable).toBe(false);
  });

  it('outside Ontario there is no prime cap, so limits are unchanged', () => {
    const bc = getTermLimits(2016, 'used', 'BC', true);
    expect(bc).toMatchObject({ subprimeAvailable: false, maxTermAllowed: 48 });
  });

  it('subprime extension never goes past 84 months', () => {
    for (let y = 2000; y <= 2027; y++) {
      expect(getTermLimits(y, 'used', 'ON', true).subprimeMaxTerm).toBeLessThanOrEqual(84);
    }
  });
});

describe('calculateAutoLoan with acceptsSubprime', () => {
  it('reports the subprime tier and floor rate when accepted', () => {
    const r = calculateAutoLoan(deal({ acceptsSubprime: true, apr: SUBPRIME_APR, termMonths: 60 }));
    expect(r.isSubprime).toBe(true);
    expect(r.financingTier).toBe('Subprime');
    expect(r.minApr).toBe(SUBPRIME_APR);
    expect(r.maxTermAllowed).toBe(60);
  });

  it('keeps prime tier and rate floor when not accepted', () => {
    const r = calculateAutoLoan(deal());
    expect(r.isSubprime).toBe(false);
    expect(r.financingTier).toBe('Prime');
    expect(r.minApr).toBe(9.99);
    expect(r.maxTermAllowed).toBe(36);
  });

  it('reverse mode uses the subprime term when accepted (longer term buys more car)', () => {
    const base = { targetBiWeeklyPayment: 300, targetMonthlyPayment: 650, vehicleYear: 2016, tradeInValue: 0, lienAmount: 0, downPayment: 2000, apr: SUBPRIME_APR, termMonths: 60, licensingFee: 59, provinceCode: 'ON', vehicleCondition: 'used' as const };
    const prime = reverseCalculateAutoLoan(base);
    const sub = reverseCalculateAutoLoan({ ...base, acceptsSubprime: true });
    expect(prime.maxTermAllowed).toBe(36);
    expect(sub.maxTermAllowed).toBe(60);
    expect(sub.maxVehiclePrice).toBeGreaterThan(prime.maxVehiclePrice);
  });
});

describe('calculatorReducer SET_SUBPRIME', () => {
  it('accepting moves to the longest subprime term at the subprime rate', () => {
    const next = calculatorReducer(stateFor(deal()), { type: 'SET_SUBPRIME', value: true });
    expect(next.inputs.acceptsSubprime).toBe(true);
    expect(next.inputs.termMonths).toBe(60);
    expect(next.inputs.apr).toBe(SUBPRIME_APR);
    expect(next.results.isSubprime).toBe(true);
    expect(next.adjustments?.termMonths).toEqual({ from: 36, to: 60 });
    expect(next.adjustments?.apr).toEqual({ from: 9.99, to: SUBPRIME_APR });
  });

  it('declining clamps the term back to the prime limit and re-seeds the rate', () => {
    const on = calculatorReducer(stateFor(deal()), { type: 'SET_SUBPRIME', value: true });
    const off = calculatorReducer(on, { type: 'SET_SUBPRIME', value: false });
    expect(off.inputs.acceptsSubprime).toBe(false);
    expect(off.inputs.termMonths).toBe(36);
    expect(off.inputs.apr).not.toBe(SUBPRIME_APR);
    expect(off.results.isSubprime).toBe(false);
  });

  it('declining keeps a rate the user typed', () => {
    let s = calculatorReducer(stateFor(deal()), { type: 'SET_SUBPRIME', value: true });
    s = calculatorReducer(s, { type: 'SET_FIELD', field: 'apr', value: 15.5 });
    s = calculatorReducer(s, { type: 'SET_SUBPRIME', value: false });
    expect(s.inputs.apr).toBe(15.5);
  });

  it('works in reverse mode', () => {
    const next = calculatorReducer(stateFor(deal(), true), { type: 'SET_SUBPRIME', value: true });
    expect(next.inputs.termMonths).toBe(60);
    expect(next.results.maxTermAllowed).toBe(60);
    expect(next.inputs.vehiclePrice).toBe(next.results.maxVehiclePrice);
  });

  it('SET_YEAR with subprime accepted defaults to the subprime term for an eligible year', () => {
    const on = calculatorReducer(stateFor(deal()), { type: 'SET_SUBPRIME', value: true });
    const next = calculatorReducer(on, { type: 'SET_YEAR', year: 2018 });
    expect(next.inputs.termMonths).toBe(60);
    expect(next.inputs.apr).toBe(SUBPRIME_APR);
  });

  it('SET_YEAR to a year with no extension quotes prime', () => {
    const on = calculatorReducer(stateFor(deal()), { type: 'SET_SUBPRIME', value: true });
    const next = calculatorReducer(on, { type: 'SET_YEAR', year: 2023 });
    expect(next.results.isSubprime).toBe(false);
    expect(next.inputs.apr).not.toBe(SUBPRIME_APR);
  });
});
