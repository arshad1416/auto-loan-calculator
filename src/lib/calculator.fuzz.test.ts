/**
 * Property fuzz for the calculator and its reducer.
 *
 * Deals are drawn from a seeded generator, so a failure prints the seed and case
 * number and replays exactly. Raise the volume with VITE_FUZZ_RUNS=200000 npx vitest run.
 */
import { describe, it, expect } from 'vitest';
import {
  calculateAutoLoan,
  reverseCalculateAutoLoan,
  computeLumpSumAmortization,
  PROVINCES,
  type CalculationInput,
  type CalculationResult,
} from './calculator';
import {
  calculatorReducer,
  createInitialState,
  type CalculatorAction,
  type CalculatorState,
} from './calculator-reducer';

const RUNS = Number(import.meta.env.VITE_FUZZ_RUNS) || 4000;
const SEED = Number(import.meta.env.VITE_FUZZ_SEED) || 0x5eed1e55;

/** mulberry32: small, fast, and good enough to spread deals across the input space. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;

const pick = <T,>(r: Rand, items: readonly T[]): T => items[Math.floor(r() * items.length)];
const cents = (n: number) => Math.round(n * 100) / 100;

/** Mostly ordinary amounts, with zeros and round numbers over-represented because edges live there. */
function money(r: Rand, max: number): number {
  const roll = r();
  if (roll < 0.2) return 0;
  if (roll < 0.35) return Math.round((r() * max) / 1000) * 1000;
  if (roll < 0.9) return Math.round(r() * max);
  return cents(r() * max);
}

/** The stops on the term slider. */
const TERMS = [12, 24, 36, 42, 48, 54, 60, 66, 72, 78, 84, 96];
/** The model years the form offers. */
const YEARS = Array.from({ length: 38 }, (_, i) => 1990 + i);
const APRS = [0, 0.99, 3.49, 6.99, 7.99, 8.99, 9.99, 12.95, 19.99, 29.99];

function randomDeal(r: Rand): CalculationInput {
  // Bracket and threshold prices are where the tax curves change slope.
  const edgePrices = [0, 1, 54_999, 55_000, 56_999, 57_000, 99_999, 100_000, 100_001, 124_999, 125_000, 150_000];
  return {
    vehicleYear: pick(r, YEARS),
    vehiclePrice: r() < 0.15 ? pick(r, edgePrices) : money(r, 250_000),
    tradeInValue: money(r, 80_000),
    lienAmount: money(r, 90_000),
    downPayment: money(r, 60_000),
    apr: r() < 0.6 ? pick(r, APRS) : cents(r() * 30),
    termMonths: pick(r, TERMS),
    licensingFee: money(r, 400),
    provinceCode: r() < 0.05 ? undefined : pick(r, PROVINCES).code,
    vehicleCondition: pick(r, ['new', 'used', undefined] as const),
    lenderAdminFee: r() < 0.2 ? undefined : money(r, 3000),
    dealerAdminFee: r() < 0.2 ? undefined : money(r, 1500),
    ppsaFee: r() < 0.2 ? undefined : money(r, 120),
    warranty: money(r, 6000),
    safetyCertification: money(r, 1500),
    otherFees: money(r, 3000),
    insuranceProducts: money(r, 5000),
  };
}

const NUMERIC_FIELDS = [
  'loanPrincipal', 'monthlyPayment', 'biWeeklyPayment', 'totalInterest', 'totalCost', 'hst', 'gst', 'pst',
  'luxuryTax', 'maxTermAllowed', 'minApr', 'minDownPaymentRequired', 'licensingFee', 'maxVehiclePrice',
  'financedNegativeEquity', 'excessNegativeEquity', 'lenderAdminFee', 'dealerAdminFee', 'ppsaFee', 'warranty',
  'safetyCertification', 'otherFees', 'insuranceProducts', 'insuranceTax',
] as const satisfies readonly (keyof CalculationResult)[];

function expectSaneNumbers(res: CalculationResult, label: string) {
  for (const field of NUMERIC_FIELDS) {
    const value = res[field] as number;
    if (!Number.isFinite(value) || value < -1e-6) {
      throw new Error(`${label}: ${field} is ${value}`);
    }
  }
}

/** Runs `body` for every case and reports the seed, case number and input of the first failure. */
function forEachCase<T>(make: (r: Rand) => T, body: (input: T, r: Rand) => void) {
  const r = rng(SEED);
  for (let i = 0; i < RUNS; i++) {
    const input = make(r);
    try {
      body(input, r);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`fuzz case ${i} (VITE_FUZZ_SEED=${SEED}) failed: ${reason}\ninput: ${JSON.stringify(input)}`, { cause: error });
    }
  }
}

/** Prices a vehicle the way the reverse search does: capped term, and the down payment lifted to the minimum. */
function reverseAsForward(deal: CalculationInput, vehiclePrice: number, found: CalculationResult): CalculationResult {
  const probe = calculateAutoLoan({ ...deal, vehiclePrice, termMonths: Math.min(deal.termMonths, found.maxTermAllowed) });
  return calculateAutoLoan({
    ...deal,
    vehiclePrice,
    termMonths: Math.min(deal.termMonths, found.maxTermAllowed),
    downPayment: Math.max(deal.downPayment, probe.minDownPaymentRequired),
  });
}

const LONG = 120_000;

describe('calculator fuzz', { timeout: LONG }, () => {
  it('forward: every figure is finite, non-negative and internally consistent', () => {
    forEachCase(randomDeal, (deal) => {
      const res = calculateAutoLoan(deal);
      expectSaneNumbers(res, 'forward');

      expect(res.biWeeklyPayment).toBeCloseTo((res.monthlyPayment * 12) / 26, 6);
      expect(res.totalCost).toBeCloseTo(res.loanPrincipal + res.totalInterest, 4);
      expect(res.financedNegativeEquity + res.excessNegativeEquity)
        .toBeCloseTo(Math.max(0, deal.lienAmount - deal.tradeInValue), 6);
      expect(res.financedNegativeEquity).toBeLessThanOrEqual(Math.round(deal.vehiclePrice * 0.4) + 1e-9);

      if (res.loanPrincipal === 0) {
        expect(res.monthlyPayment).toBe(0);
      } else {
        // A real loan costs at least its principal and at most principal plus simple interest for the term.
        const paid = res.monthlyPayment * deal.termMonths;
        expect(paid).toBeGreaterThanOrEqual(res.loanPrincipal - 0.01);
        expect(paid).toBeLessThanOrEqual(res.loanPrincipal * (1 + (deal.apr / 100) * (deal.termMonths / 12)) + 0.01);
      }
    });
  });

  it('forward: the schedule pays the loan off and never goes backwards', () => {
    forEachCase(randomDeal, (deal) => {
      const res = calculateAutoLoan(deal);
      const periods = (deal.termMonths / 12) * 26;
      expect(res.schedule.length).toBeLessThanOrEqual(periods);

      let previous = res.loanPrincipal;
      for (const row of res.schedule) {
        if (row.balance > previous + 1e-6) throw new Error(`balance rose at period ${row.period}`);
        if (row.interest < -1e-9 || row.principal < -1e-6) throw new Error(`negative split at period ${row.period}`);
        previous = row.balance;
      }
      if (res.loanPrincipal > 0) {
        const last = res.schedule[res.schedule.length - 1];
        expect(last.balance).toBeLessThanOrEqual(res.loanPrincipal * 1e-9 + 0.01);
      }
    });
  });

  it('forward: a dearer vehicle never lowers the payment, more cash down never raises it', () => {
    forEachCase(randomDeal, (deal, r) => {
      const base = calculateAutoLoan(deal).monthlyPayment;
      const dearer = calculateAutoLoan({ ...deal, vehiclePrice: deal.vehiclePrice + 1 + Math.round(r() * 5000) });
      const moreDown = calculateAutoLoan({ ...deal, downPayment: deal.downPayment + 1 + Math.round(r() * 5000) });
      expect(dearer.monthlyPayment).toBeGreaterThanOrEqual(base - 1e-6);
      expect(moreDown.monthlyPayment).toBeLessThanOrEqual(base + 1e-6);
    });
  });

  it('reverse: the price it finds fits the budget, and the next step up does not', () => {
    forEachCase(
      (r) => ({ deal: randomDeal(r), biWeekly: r() < 0.1 ? 0 : money(r, 1500), monthly: r() < 0.5 ? 0 : money(r, 3200) }),
      ({ deal, biWeekly, monthly }) => {
        const res = reverseCalculateAutoLoan({ ...deal, targetBiWeeklyPayment: biWeekly, targetMonthlyPayment: monthly });
        expectSaneNumbers(res, 'reverse');
        expect(res.maxVehiclePrice).toBeLessThanOrEqual(2_000_000);
        expect(Math.abs(res.maxVehiclePrice * 100 - Math.round(res.maxVehiclePrice * 100))).toBeLessThan(1e-6);

        const target = monthly > 0 ? monthly : (biWeekly * 26) / 12;
        const at = (price: number) =>
          reverseAsForward(deal, price, res).monthlyPayment;

        // The answer is exact to the cent and never over the budget.
        if (res.maxVehiclePrice > 0) {
          expect(res.monthlyPayment).toBeLessThanOrEqual(target + 1e-9);
          expect(at(res.maxVehiclePrice)).toBeCloseTo(res.monthlyPayment, 6);
        }
        // "Nothing dearer fits" only holds while price adds to what is financed. When the trade-in is
        // worth more than the vehicle and its fees, the taxable amount is pinned at zero and a dearer
        // vehicle can come out cheaper per month, so the search may stop short. See the PR notes.
        const taxableFees = res.lenderAdminFee + res.dealerAdminFee + (res.regulatingFee ?? 0)
          + res.warranty + res.safetyCertification + res.otherFees;
        const priceDrivesLoan = res.maxVehiclePrice + taxableFees > deal.tradeInValue;
        if (priceDrivesLoan && res.maxVehiclePrice < 2_000_000 - 50) {
          expect(at(res.maxVehiclePrice + 50)).toBeGreaterThan(target - 1e-6);
        }
      },
    );
  });

  it('lump sums only ever shorten the loan and save interest', () => {
    forEachCase(randomDeal, (deal, r) => {
      const res = calculateAutoLoan(deal);
      if (res.loanPrincipal <= 0) return;
      const extras: Record<number, number> = {};
      const count = 1 + Math.floor(r() * 4);
      for (let i = 0; i < count; i++) {
        extras[1 + Math.floor(r() * Math.max(1, res.schedule.length))] = money(r, 20_000);
      }
      const lump = computeLumpSumAmortization(res.loanPrincipal, deal.apr, deal.termMonths, res.biWeeklyPayment, extras);
      expect(lump.periodsSaved).toBeGreaterThanOrEqual(0);
      expect(lump.interestSaved).toBeGreaterThanOrEqual(-1e-6);
      for (const row of lump.schedule) {
        if (!Number.isFinite(row.balance) || row.balance < 0) throw new Error(`bad balance at period ${row.period}`);
      }
    });
  });
});

/** One thing a visitor can do. Budget targets exist only in budget mode, as on the page. */
function randomAction(r: Rand, reverseMode: boolean): CalculatorAction {
  const numericFields = [
    'vehiclePrice', 'tradeInValue', 'lienAmount', 'downPayment', 'licensingFee', 'lenderAdminFee', 'dealerAdminFee',
    'ppsaFee', 'warranty', 'safetyCertification', 'otherFees', 'insuranceProducts',
  ] as const;
  const roll = r();
  if (roll < 0.4) return { type: 'SET_FIELD', field: pick(r, numericFields), value: money(r, 200_000) };
  if (roll < 0.47) return { type: 'SET_FIELD', field: 'apr', value: r() < 0.5 ? pick(r, APRS) : cents(r() * 30) };
  if (roll < 0.54) return { type: 'SET_FIELD', field: 'termMonths', value: pick(r, TERMS) };
  if (roll < 0.6) return { type: 'SET_FIELD', field: 'provinceCode', value: pick(r, PROVINCES).code };
  if (roll < 0.64) return { type: 'SET_FIELD', field: 'vehicleCondition', value: pick(r, ['new', 'used'] as const) };
  if (roll < 0.74) return { type: 'SET_YEAR', year: pick(r, YEARS) };
  if (roll < 0.8) return { type: 'COMMIT_DOWN_PAYMENT' };
  if (roll < 0.86) return { type: 'TOGGLE_MODE' };
  if (roll < 0.91) return reverseMode ? { type: 'SET_TARGET_BIWEEKLY', value: money(r, 1500) } : { type: 'TOGGLE_MODE' };
  if (roll < 0.95) return reverseMode ? { type: 'SET_TARGET_MONTHLY', value: money(r, 3200) } : { type: 'COMMIT_DOWN_PAYMENT' };
  if (roll < 0.97) return { type: 'TOGGLE_SCHEDULE' };
  if (roll < 0.99) return { type: 'DISMISS_ADJUSTMENTS' };
  return { type: 'RESET' };
}

describe('rates far outside any real loan', { timeout: LONG }, () => {
  it('still give a finite payment instead of overflowing', () => {
    const r = rng(SEED ^ 0x00c0ffee);
    for (const apr of [100, 5000, 81_095, 1e6, 1e9, 1e12]) {
      for (let i = 0; i < 50; i++) {
        const res = calculateAutoLoan({ ...randomDeal(r), apr });
        expectSaneNumbers(res, `apr ${apr}`);
      }
    }
  });
});

describe('reducer fuzz', { timeout: LONG }, () => {
  it('survives any sequence of actions with a usable state', () => {
    const sessions = Math.max(50, Math.floor(RUNS / 40));
    const r = rng(SEED ^ 0x0badcafe);
    for (let s = 0; s < sessions; s++) {
      let state: CalculatorState = createInitialState(true);
      const trail: CalculatorAction[] = [];
      try {
        for (let step = 0; step < 60; step++) {
          const action = randomAction(r, state.reverseMode);
          trail.push(action);
          state = calculatorReducer(state, action);

          expectSaneNumbers(state.results, `after ${action.type}`);
          if (!Number.isFinite(state.inputs.apr) || !Number.isFinite(state.inputs.termMonths)) {
            throw new Error('rate or term is not a number');
          }
          if (state.reverseMode && state.inputs.vehiclePrice !== state.results.maxVehiclePrice) {
            throw new Error('reverse mode price and result disagree');
          }
          if (action.type === 'COMMIT_DOWN_PAYMENT' && !state.reverseMode
            && state.inputs.downPayment < state.results.minDownPaymentRequired - 1e-6) {
            throw new Error('down payment left below the minimum after commit');
          }
        }
        expect(calculatorReducer(state, { type: 'RESET' })).toEqual(createInitialState(true));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`session ${s} (VITE_FUZZ_SEED=${SEED}) failed: ${reason}\nactions: ${JSON.stringify(trail)}`, { cause: error });
      }
    }
  });
});
