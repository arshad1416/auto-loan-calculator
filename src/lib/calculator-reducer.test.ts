import { describe, it, expect } from 'vitest';
import { calculatorReducer } from './calculator-reducer';
import { calculateAutoLoan } from './calculator';
import type { CalculatorState } from './calculator-reducer';
import type { CalculationInput } from './calculator';

const makeState = (overrides: Partial<CalculationInput>, reverseMode = false): CalculatorState => {
  const inputs: CalculationInput = {
    vehicleYear: 2024,
    vehiclePrice: 45000,
    tradeInValue: 0,
    lienAmount: 0,
    downPayment: 5000,
    apr: 6.99,
    termMonths: 84,
    licensingFee: 59,
    provinceCode: 'ON',
    vehicleCondition: 'used',
    ...overrides,
  };
  return {
    inputs,
    results: calculateAutoLoan(inputs),
    showSchedule: false,
    adjustments: null,
    reverseMode,
    targetBiWeeklyPayment: 500,
    targetMonthlyPayment: 0,
    termByYear: {},
    downPaymentRaised: false,
  };
};

describe('calculatorReducer — Desjardins-backed rate seeding and insurance', () => {
  it('forward SET_YEAR: re-seeds APR from the lowest reserve-backed rate (6.95% promo), not the guideline', () => {
    const state = makeState({});
    const next = calculatorReducer(state, { type: 'SET_YEAR', year: 2023 });
    // default quote snaps to the Desjardins-placeable term (84 on a 2023 in ON);
    // ~$48k financed there: promos backed, lowest is 6.95%
    expect(next.inputs.apr).toBe(6.95);
    expect(next.inputs.termMonths).toBe(84);
  });

  it('forward SET_YEAR: falls back to the CARF guideline when no rate is backed (price 0)', () => {
    const state = makeState({ vehiclePrice: 0 });
    const next = calculatorReducer(state, { type: 'SET_YEAR', year: 2024 });
    expect(next.inputs.apr).toBe(6.99);
  });

  it('reverse SET_YEAR keeps the user rate (minApr is advisory, not a floor)', () => {
    const state = makeState({ apr: 6.95, termMonths: 96 }, true);
    const next = calculatorReducer(state, { type: 'SET_YEAR', year: 2020 });
    expect(next.inputs.apr).toBe(6.95); // kept despite being below the 7.99 guideline
  });

  it('termByYear: restores a manually chosen term when switching years and back', () => {
    let state = makeState({});
    state = calculatorReducer(state, { type: 'SET_FIELD', field: 'termMonths', value: 60 });
    expect(state.termByYear[2024]).toBe(60);

    state = calculatorReducer(state, { type: 'SET_YEAR', year: 2023 });
    expect(state.inputs.termMonths).toBe(84); // no memory for 2023 -> Desjardins-placeable max

    state = calculatorReducer(state, { type: 'SET_YEAR', year: 2024 });
    expect(state.inputs.termMonths).toBe(60); // restored
  });

  it('reverse mode: financed insurance reduces the max vehicle price', () => {
    const state = makeState({ apr: 6.99 }, true);
    const without = calculatorReducer(state, { type: 'SET_FIELD', field: 'insuranceProducts', value: 0 });
    const withIns = calculatorReducer(state, { type: 'SET_FIELD', field: 'insuranceProducts', value: 1000 });
    expect(withIns.results.maxVehiclePrice).toBeLessThan(without.results.maxVehiclePrice);
    expect(withIns.results.insuranceProducts).toBe(1000);
  });
});
