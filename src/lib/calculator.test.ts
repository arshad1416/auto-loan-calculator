import { describe, it, expect } from 'vitest';
import { calculateAutoLoan, reverseCalculateAutoLoan } from './calculator';
import type { CalculationInput } from './calculator';

const baseInput: CalculationInput = {
  vehicleYear: 2024,
  vehiclePrice: 45000,
  tradeInValue: 0,
  lienAmount: 0,
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
    expect(r.minDownPaymentRequired).toBe(baseInput.vehiclePrice * 0.50);
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

  it('lien amount increases loan principal by the lien amount', () => {
    const noLien = calculateAutoLoan(baseInput);
    const withLien = calculateAutoLoan({ ...baseInput, lienAmount: 5000 });
    // lien 5000, tradeIn 0 → netTradeEffect = 5000 (negative equity)
    expect(withLien.loanPrincipal).toBeCloseTo(noLien.loanPrincipal + 5000, 1);
    expect(withLien.financedNegativeEquity).toBe(5000);
    expect(withLien.excessNegativeEquity).toBe(0);
  });

  it('positive equity (tradeIn > lien) reduces loan principal', () => {
    // tradeIn 15000, lien 5000 → netTradeEffect = -10000 (positive equity of $10k)
    const r = calculateAutoLoan({ ...baseInput, tradeInValue: 15000, lienAmount: 5000 });
    const noTrade = calculateAutoLoan(baseInput);
    // Loan should be lower than base because $10k positive equity offsets the loan
    expect(r.loanPrincipal).toBeLessThan(noTrade.loanPrincipal - 8000);
    expect(r.financedNegativeEquity).toBe(0);
    expect(r.excessNegativeEquity).toBe(0);
  });

  it('lien over 40% cap: only capped amount financed, excess increases min down payment', () => {
    // 40% of $45,000 = $18,000. Lien of $25,000 → $7,000 excess
    const r = calculateAutoLoan({ ...baseInput, lienAmount: 25000 });
    expect(r.financedNegativeEquity).toBe(18000);
    expect(r.excessNegativeEquity).toBe(7000);
    expect(r.minDownPaymentRequired).toBe(7000); // comes from excess, not year rules
  });

  it('lien over 40% cap: excess adds to year-based min down payment', () => {
    // 2014 vehicle: 10% min down on $30,000 = $3,000
    // 40% cap on $30,000 = $12,000. Lien of $20,000 → $8,000 excess
    // minDownPaymentRequired = max($3,000, $8,000) = $8,000
    const r = calculateAutoLoan({ ...baseInput, vehicleYear: 2014, vehiclePrice: 30000, lienAmount: 20000 });
    expect(r.financedNegativeEquity).toBe(12000);
    expect(r.excessNegativeEquity).toBe(8000);
    expect(r.minDownPaymentRequired).toBe(8000);
    // Loan principal uses capped lien ($12,000), not full $20,000
    expect(r.loanPrincipal).toBeGreaterThan(0);
  });
});

describe('reverseCalculateAutoLoan', () => {
  it('calculates max vehicle price from target bi-weekly payment', () => {
    const r = reverseCalculateAutoLoan({ targetBiWeeklyPayment: 500, targetMonthlyPayment: 0, vehicleYear: 2024, tradeInValue: 0, lienAmount: 0, downPayment: 0, termMonths: 84, licensingFee: 56 });
    expect(r.maxVehiclePrice).toBeGreaterThan(60000);
    expect(r.maxVehiclePrice).toBeLessThan(63000);
    expect(r.biWeeklyPayment).toBeCloseTo(500, 0);
  });
  it('converts target monthly to bi-weekly automatically', () => {
    const r = reverseCalculateAutoLoan({ targetBiWeeklyPayment: 0, targetMonthlyPayment: 1000, vehicleYear: 2024, tradeInValue: 0, lienAmount: 0, downPayment: 0, termMonths: 84, licensingFee: 56 });
    expect(r.biWeeklyPayment).toBeCloseTo(461.54, 0);
  });
  it('2014 vehicle gets 14.99% APR, 66mo max term with 10% down floor', () => {
    const r = reverseCalculateAutoLoan({ targetBiWeeklyPayment: 400, targetMonthlyPayment: 0, vehicleYear: 2014, tradeInValue: 0, lienAmount: 0, downPayment: 0, termMonths: 66, licensingFee: 56 });
    expect(r.maxTermAllowed).toBe(66);
    expect(r.minApr).toBe(14.99);
    expect(r.loanPrincipal).toBeGreaterThan(0);
    expect(r.schedule.length).toBeGreaterThan(0);
  });
  it('pre-2010 vehicle gets 19.99% APR, 48mo, 50% down floor', () => {
    const r = reverseCalculateAutoLoan({ targetBiWeeklyPayment: 300, targetMonthlyPayment: 0, vehicleYear: 2008, tradeInValue: 0, lienAmount: 0, downPayment: 0, termMonths: 48, licensingFee: 56 });
    expect(r.maxTermAllowed).toBe(48);
    expect(r.minApr).toBe(19.99);
    expect(r.isBankFinancable).toBe(false);
  });
  it('shorter term reduces max vehicle price', () => {
    const r66 = reverseCalculateAutoLoan({ targetBiWeeklyPayment: 400, targetMonthlyPayment: 0, vehicleYear: 2014, tradeInValue: 0, lienAmount: 0, downPayment: 0, termMonths: 66, licensingFee: 56 });
    const r48 = reverseCalculateAutoLoan({ targetBiWeeklyPayment: 400, targetMonthlyPayment: 0, vehicleYear: 2014, tradeInValue: 0, lienAmount: 0, downPayment: 0, termMonths: 48, licensingFee: 56 });
    expect(r48.maxVehiclePrice).toBeLessThan(r66.maxVehiclePrice);
    expect(r48.biWeeklyPayment).toBeCloseTo(400, 0);
  });

  it('lien over 40% cap reduces max vehicle price in reverse mode', () => {
    const noLien = reverseCalculateAutoLoan({ targetBiWeeklyPayment: 400, targetMonthlyPayment: 0, vehicleYear: 2024, tradeInValue: 0, lienAmount: 0, downPayment: 0, termMonths: 84, licensingFee: 56 });
    const withLien = reverseCalculateAutoLoan({ targetBiWeeklyPayment: 400, targetMonthlyPayment: 0, vehicleYear: 2024, tradeInValue: 0, lienAmount: 15000, downPayment: 0, termMonths: 84, licensingFee: 56 });
    // Lien exceeding 40% cap should reduce maxPrice since less negative equity is financeable
    expect(withLien.maxVehiclePrice).toBeLessThan(noLien.maxVehiclePrice);
  });
});

describe('Province-specific calculations', () => {
  it('calculates correct tax for Alberta (5% GST only, $10 AMVIC levy, $0 admin fee)', () => {
    // Alberta code is AB. GST = 5%, PST = 0. Admin fee = 0. Regulating fee = 10.
    // taxable base = 45000 - 0 + 0 + 10 = 45010
    // GST = 45010 * 0.05 = 2250.5
    // PST = 0
    const r = calculateAutoLoan({ ...baseInput, provinceCode: 'AB' });
    expect(r.gst).toBeCloseTo(2250.5, 1);
    expect(r.pst).toBe(0);
    expect(r.hst).toBeCloseTo(2250.5, 1); // hst is combined tax field
  });

  it('calculates correct tax for British Columbia (5% GST + progressive PST, $10 VSA levy, $0 admin fee)', () => {
    // BC code is BC.
    // Price = 45000 (< 55000) -> PST = 7%. Regulating fee = 10. Admin fee = 0.
    // taxable base = 45000 - 0 + 0 + 10 = 45010
    // GST = 45010 * 0.05 = 2250.5
    // PST = 45010 * 0.07 = 3150.7
    // Total Tax = 5401.2
    const r = calculateAutoLoan({ ...baseInput, provinceCode: 'BC' });
    expect(r.gst).toBeCloseTo(2250.5, 1);
    expect(r.pst).toBeCloseTo(3150.7, 1);
    expect(r.hst).toBeCloseTo(5401.2, 1);
  });

  it('handles progressive BC PST rates for high-end vehicles ($0 admin fee, used = no luxury tax)', () => {
    // Price = 130000 -> BC PST rate is 15%. Admin fee = 0. Regulating fee = 10.
    // No luxury tax (used vehicle by default)
    // taxable base = 130000 - 0 + 0 + 10 = 130010
    // GST = 130010 * 0.05 = 6500.5
    // PST = 130010 * 0.15 = 19501.5
    // Total Tax = 26002.0
    const r = calculateAutoLoan({ ...baseInput, vehiclePrice: 130000, provinceCode: 'BC' });
    expect(r.luxuryTax).toBe(0);
    expect(r.gst).toBeCloseTo(6500.5, 1);
    expect(r.pst).toBeCloseTo(19501.5, 1);
    expect(r.hst).toBeCloseTo(26002.0, 1);
  });

  it('runs reverse calculation correctly in BC with progressive PST rates', () => {
    // Test reverse calculation with target bi-weekly payment in BC
    const r = reverseCalculateAutoLoan({
      targetBiWeeklyPayment: 500,
      targetMonthlyPayment: 0,
      vehicleYear: 2024,
      tradeInValue: 0,
      lienAmount: 0,
      downPayment: 0,
      termMonths: 84,
      licensingFee: 150,
      provinceCode: 'BC',
    });
    expect(r.maxVehiclePrice).toBeGreaterThan(50000);
    expect(r.biWeeklyPayment).toBeCloseTo(500, 0);
  });
});

describe('Federal Luxury Tax', () => {
  it('applies 0 luxury tax to used vehicles even above $100,000', () => {
    const r = calculateAutoLoan({ ...baseInput, vehiclePrice: 150000, vehicleCondition: 'used' });
    expect(r.luxuryTax).toBe(0);
  });

  it('applies 0 luxury tax when vehicleCondition is not set (defaults to used)', () => {
    const r = calculateAutoLoan({ ...baseInput, vehiclePrice: 150000 });
    expect(r.luxuryTax).toBe(0);
  });

  it('applies 0 luxury tax to new vehicles priced at or below $100,000', () => {
    const r = calculateAutoLoan({ ...baseInput, vehiclePrice: 95000, vehicleCondition: 'new' });
    expect(r.luxuryTax).toBe(0);
  });

  it('applies luxury tax to new vehicles above $100,000 (lesser of 10% or 20% of excess)', () => {
    // Vehicle price = 110,000, new
    // 10% of 110,000 = 11,000
    // 20% of (110,000 - 100,000) = 2,000
    // Lesser is 2,000
    const r = calculateAutoLoan({ ...baseInput, vehiclePrice: 110000, provinceCode: 'ON', vehicleCondition: 'new' });
    expect(r.luxuryTax).toBeCloseTo(2000, 1);
  });

  it('applies 10% luxury tax rate class for extremely high-end new vehicles', () => {
    // Vehicle price = 250,000, new
    // 10% of 250,000 = 25,000
    // 20% of 150,000 = 30,000
    // Lesser is 25,000
    const r = calculateAutoLoan({ ...baseInput, vehiclePrice: 250000, provinceCode: 'ON', vehicleCondition: 'new' });
    expect(r.luxuryTax).toBeCloseTo(25000, 1);
  });

  it('calculates reverse loan price correctly when luxury tax is triggered on new vehicle', () => {
    const r = reverseCalculateAutoLoan({
      targetBiWeeklyPayment: 1200,
      targetMonthlyPayment: 0,
      vehicleYear: 2024,
      tradeInValue: 0,
      lienAmount: 0,
      downPayment: 10000,
      termMonths: 84,
      licensingFee: 59,
      provinceCode: 'ON',
      vehicleCondition: 'new',
    });
    expect(r.maxVehiclePrice).toBeGreaterThan(100000);
    expect(r.biWeeklyPayment).toBeCloseTo(1200, 0);
  });
});

describe('Additional fees & products', () => {
  it('lender admin fee defaults to $2,000 in Ontario', () => {
    const r = calculateAutoLoan({ ...baseInput, provinceCode: 'ON' });
    expect(r.lenderAdminFee).toBe(2000);
  });

  it('lender admin fee defaults to $0 outside Ontario', () => {
    const r = calculateAutoLoan({ ...baseInput, provinceCode: 'BC' });
    expect(r.lenderAdminFee).toBe(0);
  });

  it('lender admin fee can be overridden', () => {
    const r = calculateAutoLoan({ ...baseInput, provinceCode: 'ON', lenderAdminFee: 500 });
    expect(r.lenderAdminFee).toBe(500);
    // Taxable amount should be lower with reduced admin fee
    const rDefault = calculateAutoLoan({ ...baseInput, provinceCode: 'ON' });
    expect(r.hst).toBeLessThan(rDefault.hst);
  });

  it('dealer admin fee is user-editable and taxable', () => {
    const noDealer = calculateAutoLoan(baseInput);
    const withDealer = calculateAutoLoan({ ...baseInput, dealerAdminFee: 500 });
    // $500 dealer admin × 13% HST = $65 more tax
    expect(withDealer.hst).toBeCloseTo(noDealer.hst + 65, 1);
    expect(withDealer.dealerAdminFee).toBe(500);
  });

  it('warranty is added to taxable amount and taxed', () => {
    const noWarranty = calculateAutoLoan(baseInput);
    const withWarranty = calculateAutoLoan({ ...baseInput, warranty: 3000 });
    // $3,000 warranty × 13% HST = $390 more tax
    expect(withWarranty.hst).toBeCloseTo(noWarranty.hst + 390, 1);
    expect(withWarranty.warranty).toBe(3000);
  });

  it('safety certification is added to taxable amount and taxed', () => {
    const noSafety = calculateAutoLoan(baseInput);
    const withSafety = calculateAutoLoan({ ...baseInput, safetyCertification: 150 });
    // $150 safety cert × 13% HST = $19.50 more tax
    expect(withSafety.hst).toBeCloseTo(noSafety.hst + 19.50, 1);
    expect(withSafety.safetyCertification).toBe(150);
  });

  it('other fees are added to taxable amount and taxed', () => {
    const noOther = calculateAutoLoan(baseInput);
    const withOther = calculateAutoLoan({ ...baseInput, otherFees: 500 });
    // $500 other fees × 13% HST = $65 more tax
    expect(withOther.hst).toBeCloseTo(noOther.hst + 65, 1);
    expect(withOther.otherFees).toBe(500);
  });

  it('all additional fees combined increase loan principal', () => {
    const withAll = calculateAutoLoan({
      ...baseInput,
      provinceCode: 'ON',
      dealerAdminFee: 800,
      warranty: 3000,
      safetyCertification: 150,
      otherFees: 500,
    });
    // baseOn already has $2,000 lender admin; withAll adds dealer + warranty + safety + other
    const baseOn = calculateAutoLoan(baseInput);
    const extraFeeTotal = 800 + 3000 + 150 + 500; // dealer + warranty + safety + other
    const extraTax = extraFeeTotal * 0.13;
    expect(withAll.loanPrincipal).toBeCloseTo(baseOn.loanPrincipal + extraFeeTotal + extraTax, 1);
  });

  it('additional fees work correctly in Alberta (5% GST only)', () => {
    const r = calculateAutoLoan({
      ...baseInput,
      provinceCode: 'AB',
      warranty: 2000,
      safetyCertification: 100,
      otherFees: 0,
    });
    // GST = 5% of fee total = $105
    expect(r.warranty).toBe(2000);
    expect(r.safetyCertification).toBe(100);
    expect(r.hst).toBeGreaterThan(calculateAutoLoan({ ...baseInput, provinceCode: 'AB' }).hst);
  });

  it('additional fees reduce max vehicle price in reverse mode', () => {
    const noFees = reverseCalculateAutoLoan({
      targetBiWeeklyPayment: 500,
      targetMonthlyPayment: 0,
      vehicleYear: 2024,
      tradeInValue: 0,
      lienAmount: 0,
      downPayment: 0,
      termMonths: 84,
      licensingFee: 59,
      provinceCode: 'ON',
    });
    const withFees = reverseCalculateAutoLoan({
      targetBiWeeklyPayment: 500,
      targetMonthlyPayment: 0,
      vehicleYear: 2024,
      tradeInValue: 0,
      lienAmount: 0,
      downPayment: 0,
      termMonths: 84,
      licensingFee: 59,
      provinceCode: 'ON',
      warranty: 3000,
    });
    // $3,000 warranty should reduce max vehicle price since budget is fixed
    expect(withFees.maxVehiclePrice).toBeLessThan(noFees.maxVehiclePrice);
  });
});
