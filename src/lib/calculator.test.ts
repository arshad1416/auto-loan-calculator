import { describe, it, expect } from 'vitest';
import { calculateAutoLoan, reverseCalculateAutoLoan } from './calculator';
import type { CalculationInput } from './calculator';

const baseInput: CalculationInput = {
  vehicleYear: 2024,
  vehiclePrice: 45000,
  tradeInValue: 0,
  downPayment: 5000,
  apr: 6.99,
  termMonths: 84,
  licensingFee: 56,
};

describe('calculateAutoLoan', () => {
  // ── Year-based lending rules ──────────────────────────────────────

  it('2023+ vehicles: 84mo max, 6.99% min APR, no down payment required', () => {
    const r = calculateAutoLoan({ ...baseInput, vehicleYear: 2023 });
    expect(r.maxTermAllowed).toBe(84);
    expect(r.minApr).toBe(6.99);
    expect(r.minDownPaymentRequired).toBe(0);
    expect(r.isBankFinancable).toBe(true);
  });

  it('2021-2022 vehicles: 72mo max, 7.99% min APR', () => {
    const r = calculateAutoLoan({ ...baseInput, vehicleYear: 2021 });
    expect(r.maxTermAllowed).toBe(72);
    expect(r.minApr).toBe(7.99);
    expect(r.isBankFinancable).toBe(true);
  });

  it('2016-2020 vehicles: 60mo max, 8.99% min APR', () => {
    const r = calculateAutoLoan({ ...baseInput, vehicleYear: 2018 });
    expect(r.maxTermAllowed).toBe(60);
    expect(r.minApr).toBe(8.99);
    expect(r.isBankFinancable).toBe(true);
  });

  it('2010-2015 vehicles: 66mo max, 14.99% min APR, 10% down on vehicle price', () => {
    const r = calculateAutoLoan({ ...baseInput, vehicleYear: 2014, vehiclePrice: 30000 });
    expect(r.maxTermAllowed).toBe(66);
    expect(r.minApr).toBe(14.99);
    expect(r.minDownPaymentRequired).toBe(3000); // 10% of 30000
    expect(r.isBankFinancable).toBe(true);
  });

  it('pre-2010 vehicles: not bank-financeable, 48mo, 19.99% min APR', () => {
    const r = calculateAutoLoan({ ...baseInput, vehicleYear: 2008 });
    expect(r.maxTermAllowed).toBe(48);
    expect(r.minApr).toBe(19.99);
    expect(r.isBankFinancable).toBe(false);
    expect(r.minDownPaymentRequired).toBe(baseInput.vehiclePrice * 0.25);
  });

  // ── HST / fee calculations ────────────────────────────────────────

  it('calculates HST at 13% on (price - trade + admin + OMVIC)', () => {
    // taxable = 45000 - 0 + 2000 + 22 = 47022, HST = 47022 * 0.13 = 6112.86
    const r = calculateAutoLoan(baseInput);
    expect(r.hst).toBeCloseTo(6112.86, 1);
  });

  it('trade-in value reduces taxable amount (trade-in is pre-tax)', () => {
    const noTrade = calculateAutoLoan(baseInput);
    const withTrade = calculateAutoLoan({ ...baseInput, tradeInValue: 10000 });
    // trade-in reduces taxable by 10000, so HST drops by 10000 * 0.13 = 1300
    expect(withTrade.hst).toBeCloseTo(noTrade.hst - 1300, 1);
    expect(withTrade.loanPrincipal).toBeLessThan(noTrade.loanPrincipal);
  });

  it('includes OMVIC ($22), licensing ($56), and admin ($2000) fees', () => {
    // taxable = 45000 - 0 + 2000 + 22 = 47022
    // HST = 47022 * 0.13 = 6112.86
    // loan principal = 47022 + 6112.86 + 56 - 5000 = 48190.86
    const r = calculateAutoLoan(baseInput);
    expect(r.loanPrincipal).toBeCloseTo(48190.86, 1);
  });

  // ── Payment math ──────────────────────────────────────────────────

  it('bi-weekly payment × 26 ≈ monthly payment × 12', () => {
    const r = calculateAutoLoan(baseInput);
    const annualBiWeekly = r.biWeeklyPayment * 26;
    const annualMonthly = r.monthlyPayment * 12;
    expect(annualBiWeekly).toBeCloseTo(annualMonthly, 0);
  });

  it('0% APR: payment = principal / periods', () => {
    const r = calculateAutoLoan({ ...baseInput, apr: 0 });
    expect(r.monthlyPayment).toBeCloseTo(r.loanPrincipal / baseInput.termMonths, 2);
  });

  // ── Amortization schedule ─────────────────────────────────────────

  it('produces correct number of bi-weekly periods', () => {
    const r = calculateAutoLoan(baseInput);
    // 84 months = 7 years = 7 * 26 = 182 bi-weekly periods
    expect(r.schedule.length).toBe(182);
  });

  it('each period: principal + interest = payment (within rounding)', () => {
    const r = calculateAutoLoan(baseInput);
    for (const period of r.schedule) {
      expect(period.principal + period.interest).toBeCloseTo(period.payment, 2);
    }
  });

  it('final balance reaches zero', () => {
    const r = calculateAutoLoan(baseInput);
    const last = r.schedule[r.schedule.length - 1];
    expect(last.balance).toBeLessThan(0.01);
  });

  it('total interest equals sum of all period interest', () => {
    const r = calculateAutoLoan(baseInput);
    const sumInterest = r.schedule.reduce((s, p) => s + p.interest, 0);
    expect(r.totalInterest).toBeCloseTo(sumInterest, 1);
  });

  // ── Edge cases ────────────────────────────────────────────────────

  it('zero vehicle price results in zero or near-zero payments', () => {
    const r = calculateAutoLoan({ ...baseInput, vehiclePrice: 0, downPayment: 0 });
    // Only fees: taxable = 2022, HST = 262.86, principal = 2022 + 262.86 + 56 = 2340.86
    expect(r.loanPrincipal).toBeCloseTo(2340.86, 1);
  });

  it('large down payment wipes out the loan', () => {
    const r = calculateAutoLoan({ ...baseInput, downPayment: 100000 });
    expect(r.loanPrincipal).toBe(0);
    expect(r.monthlyPayment).toBe(0);
    expect(r.biWeeklyPayment).toBe(0);
    expect(r.totalInterest).toBe(0);
  });

  it('large trade-in can wipe out the taxable amount', () => {
    const r = calculateAutoLoan({ ...baseInput, tradeInValue: 50000 });
    expect(r.loanPrincipal).toBeLessThan(1000); // essentially zero after fees
  });
});

describe('reverseCalculateAutoLoan', () => {
  it('calculates max vehicle price from target bi-weekly payment', () => {
    const r = reverseCalculateAutoLoan({ targetBiWeeklyPayment: 500, targetMonthlyPayment: 0, vehicleYear: 2024, tradeInValue: 0, downPayment: 0, termMonths: 84, licensingFee: 56 });
    expect(r.maxVehiclePrice).toBeGreaterThan(60000);
    expect(r.maxVehiclePrice).toBeLessThan(63000);
    expect(r.biWeeklyPayment).toBeCloseTo(500, 0);
  });
  it('converts target monthly to bi-weekly automatically', () => {
    const r = reverseCalculateAutoLoan({ targetBiWeeklyPayment: 0, targetMonthlyPayment: 1000, vehicleYear: 2024, tradeInValue: 0, downPayment: 0, termMonths: 84, licensingFee: 56 });
    expect(r.biWeeklyPayment).toBeCloseTo(461.54, 0);
  });
  it('2014 vehicle gets 14.99% APR, 66mo max term with 10% down floor', () => {
    const r = reverseCalculateAutoLoan({ targetBiWeeklyPayment: 400, targetMonthlyPayment: 0, vehicleYear: 2014, tradeInValue: 0, downPayment: 0, termMonths: 66, licensingFee: 56 });
    expect(r.maxTermAllowed).toBe(66);
    expect(r.minApr).toBe(14.99);
    expect(r.loanPrincipal).toBeGreaterThan(0);
    expect(r.schedule.length).toBeGreaterThan(0);
  });
  it('pre-2010 vehicle gets 19.99% APR, 48mo, 25% down floor', () => {
    const r = reverseCalculateAutoLoan({ targetBiWeeklyPayment: 300, targetMonthlyPayment: 0, vehicleYear: 2008, tradeInValue: 0, downPayment: 0, termMonths: 48, licensingFee: 56 });
    expect(r.maxTermAllowed).toBe(48);
    expect(r.minApr).toBe(19.99);
    expect(r.isBankFinancable).toBe(false);
  });
  it('shorter term reduces max vehicle price', () => {
    const r66 = reverseCalculateAutoLoan({ targetBiWeeklyPayment: 400, targetMonthlyPayment: 0, vehicleYear: 2014, tradeInValue: 0, downPayment: 0, termMonths: 66, licensingFee: 56 });
    const r48 = reverseCalculateAutoLoan({ targetBiWeeklyPayment: 400, targetMonthlyPayment: 0, vehicleYear: 2014, tradeInValue: 0, downPayment: 0, termMonths: 48, licensingFee: 56 });
    expect(r48.maxVehiclePrice).toBeLessThan(r66.maxVehiclePrice);
    expect(r48.biWeeklyPayment).toBeCloseTo(400, 0);
  });
});
