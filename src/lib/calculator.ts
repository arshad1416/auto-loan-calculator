/**
 * Auto Loan Calculator Logic
 * Factors in Ontario-specific taxes (HST 13%), OMVIC fees, and Lender Admin fees.
 */

export interface AmortizationPeriod {
  period: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

export type VehicleCondition = 'new' | 'used';

export interface CalculationInput {
  vehicleYear: number;
  vehiclePrice: number;
  tradeInValue: number;
  lienAmount: number;
  downPayment: number;
  apr: number;
  termMonths: number;
  licensingFee: number;
  provinceCode?: string;
  vehicleCondition?: VehicleCondition;
  dealerAdminFee?: number;
  warranty?: number;
  safetyCertification?: number;
  otherFees?: number;
}

export interface CalculationResult {
  loanPrincipal: number;
  monthlyPayment: number;
  biWeeklyPayment: number;
  totalInterest: number;
  totalCost: number;
  hst: number; // total combined tax
  gst?: number;
  pst?: number;
  luxuryTax?: number; // Federal luxury tax
  maxTermAllowed: number;
  minApr: number;
  minDownPaymentRequired: number;
  licensingFee: number;
  isBankFinancable: boolean;
  schedule: AmortizationPeriod[];
  maxVehiclePrice: number;
  financedNegativeEquity: number;
  excessNegativeEquity: number;
  provinceCode?: string;
  regulatingFee?: number;
  regulatingFeeName?: string;
  dealerAdminFee: number;
  warranty: number;
  safetyCertification: number;
  otherFees: number;
}

const NEGATIVE_EQUITY_CAP = 0.40; // Max % of vehicle price that can be rolled in as negative equity

export interface ProvinceData {
  code: string;
  name: string;
  taxType: 'HST' | 'GST+PST' | 'GST';
  gstRate: number;
  pstRate: number;
  regulatingFee: number;
  regulatingFeeName: string;
  defaultLicensingFee: number;
}

export const PROVINCES: ProvinceData[] = [
  { code: 'ON', name: 'Ontario', taxType: 'HST', gstRate: 0, pstRate: 0.13, regulatingFee: 22.00, regulatingFeeName: 'OMVIC Fee', defaultLicensingFee: 59 },
  { code: 'QC', name: 'Quebec', taxType: 'GST+PST', gstRate: 0.05, pstRate: 0.09975, regulatingFee: 0, regulatingFeeName: '', defaultLicensingFee: 120 },
  { code: 'BC', name: 'British Columbia', taxType: 'GST+PST', gstRate: 0.05, pstRate: 0.07, regulatingFee: 10.00, regulatingFeeName: 'VSA Levy', defaultLicensingFee: 150 },
  { code: 'AB', name: 'Alberta', taxType: 'GST', gstRate: 0.05, pstRate: 0, regulatingFee: 10.00, regulatingFeeName: 'AMVIC Levy', defaultLicensingFee: 95 },
  { code: 'SK', name: 'Saskatchewan', taxType: 'GST+PST', gstRate: 0.05, pstRate: 0.06, regulatingFee: 0, regulatingFeeName: '', defaultLicensingFee: 100 },
  { code: 'MB', name: 'Manitoba', taxType: 'GST+PST', gstRate: 0.05, pstRate: 0.07, regulatingFee: 0, regulatingFeeName: '', defaultLicensingFee: 150 },
  { code: 'NB', name: 'New Brunswick', taxType: 'HST', gstRate: 0, pstRate: 0.15, regulatingFee: 0, regulatingFeeName: '', defaultLicensingFee: 100 },
  { code: 'NS', name: 'Nova Scotia', taxType: 'HST', gstRate: 0, pstRate: 0.14, regulatingFee: 0, regulatingFeeName: '', defaultLicensingFee: 150 },
  { code: 'PE', name: 'Prince Edward Island', taxType: 'HST', gstRate: 0, pstRate: 0.15, regulatingFee: 0, regulatingFeeName: '', defaultLicensingFee: 100 },
  { code: 'NL', name: 'Newfoundland and Labrador', taxType: 'HST', gstRate: 0, pstRate: 0.15, regulatingFee: 0, regulatingFeeName: '', defaultLicensingFee: 180 },
  { code: 'YT', name: 'Yukon', taxType: 'GST', gstRate: 0.05, pstRate: 0, regulatingFee: 0, regulatingFeeName: '', defaultLicensingFee: 100 },
  { code: 'NT', name: 'Northwest Territories', taxType: 'GST', gstRate: 0.05, pstRate: 0, regulatingFee: 0, regulatingFeeName: '', defaultLicensingFee: 100 },
  { code: 'NU', name: 'Nunavut', taxType: 'GST', gstRate: 0.05, pstRate: 0, regulatingFee: 0, regulatingFeeName: '', defaultLicensingFee: 100 },
];

export const getBcPstRate = (price: number): number => {
  if (price < 55000) return 0.07;
  if (price < 56000) return 0.08;
  if (price < 57000) return 0.09;
  if (price < 125000) return 0.10;
  if (price < 150000) return 0.15;
  return 0.20;
};

interface YearRules {
  maxTermAllowed: number;
  minApr: number;
  isBankFinancable: boolean;
  minDownPaymentPct: number;
}

export function getYearRules(vehicleYear: number): YearRules {
  if (vehicleYear >= 2023) {
    return { maxTermAllowed: 84, minApr: 6.99, isBankFinancable: true, minDownPaymentPct: 0 };
  } else if (vehicleYear >= 2021) {
    return { maxTermAllowed: 72, minApr: 7.99, isBankFinancable: true, minDownPaymentPct: 0 };
  } else if (vehicleYear >= 2016) {
    return { maxTermAllowed: 60, minApr: 8.99, isBankFinancable: true, minDownPaymentPct: 0 };
  } else if (vehicleYear >= 2010) {
    return { maxTermAllowed: 66, minApr: 14.99, isBankFinancable: true, minDownPaymentPct: 0.10 };
  } else {
    return { maxTermAllowed: 48, minApr: 19.99, isBankFinancable: false, minDownPaymentPct: 0.25 };
  }
}

function computeAmortization(
  loanPrincipal: number, apr: number, termMonths: number, biWeeklyPayment: number
): AmortizationPeriod[] {
  const schedule: AmortizationPeriod[] = [];
  const biWeeklyRate = apr / 100 / 26;
  const totalPeriods = (termMonths / 12) * 26;
  let currentBalance = loanPrincipal;

  for (let i = 1; i <= totalPeriods; i++) {
    const interestPayment = currentBalance * biWeeklyRate;
    const principalPayment = Math.min(currentBalance, biWeeklyPayment - interestPayment);
    currentBalance = Math.max(0, currentBalance - principalPayment);
    schedule.push({
      period: i,
      payment: principalPayment + interestPayment,
      principal: principalPayment,
      interest: interestPayment,
      balance: currentBalance
    });
    if (currentBalance <= 0) break;
  }
  return schedule;
}

export const calculateAutoLoan = (input: CalculationInput): CalculationResult => {
  const { vehicleYear, vehiclePrice, tradeInValue, lienAmount, downPayment, apr, termMonths, licensingFee, provinceCode, vehicleCondition, dealerAdminFee, warranty, safetyCertification, otherFees } = input;

  const rules = getYearRules(vehicleYear);
  const maxTermAllowed = rules.maxTermAllowed;
  const minApr = rules.minApr;
  const isBankFinancable = rules.isBankFinancable;

  const provCode = provinceCode || 'ON';
  const province = PROVINCES.find(p => p.code === provCode) || PROVINCES[0];
  const regulatingFee = province.regulatingFee;

  // Use input dealerAdminFee (defaults to 2000 for ON, 0 elsewhere)
  const dealerAdmin = dealerAdminFee ?? (provCode === 'ON' ? 2000 : 0);
  const warrantyFee = warranty ?? 0;
  const safetyFee = safetyCertification ?? 0;
  const otherFeeAmount = otherFees ?? 0;

  // Calculate Federal Luxury Tax: Lesser of 10% of total price or 20% of amount over $100,000
  // CRA: Applies to NEW vehicles only, based on the retail sale price (not dealer admin or regulatory fees)
  const isNew = vehicleCondition === 'new';
  const luxuryTax = (isNew && vehiclePrice > 100000) ? Math.min(vehiclePrice * 0.10, (vehiclePrice - 100000) * 0.20) : 0;

  // 1. Calculate Taxable Amount (trade-in reduces base; luxury tax is taxable; all additional fees/products are taxable)
  const taxableAmount = Math.max(0, vehiclePrice - tradeInValue + dealerAdmin + regulatingFee + luxuryTax + warrantyFee + safetyFee + otherFeeAmount);

  // 2. Net equity from trade: negative = positive equity (reduces loan), positive = negative equity
  const netTradeEffect = lienAmount - tradeInValue;
  const maxFinanceableNegativeEquity = Math.round(vehiclePrice * NEGATIVE_EQUITY_CAP);
  
  const negativeEquity = Math.max(0, netTradeEffect);
  const financedNegativeEquity = Math.min(negativeEquity, maxFinanceableNegativeEquity);
  const excessNegativeEquity = Math.max(0, negativeEquity - maxFinanceableNegativeEquity);
  const financedLien = lienAmount - excessNegativeEquity;

  const minDownPaymentRequired = Math.max(
    Math.round(vehiclePrice * rules.minDownPaymentPct),
    excessNegativeEquity,
  );

  // 3. Calculate Sales Taxes
  const pstRate = provCode === 'BC' ? getBcPstRate(vehiclePrice) : province.pstRate;
  const gst = province.taxType === 'HST' ? 0 : taxableAmount * province.gstRate;
  const pst = province.taxType === 'HST' ? 0 : taxableAmount * pstRate;
  const hstAmount = province.taxType === 'HST' ? taxableAmount * province.pstRate : 0;
  const totalTax = gst + pst + hstAmount;

  // 4. Calculate Loan Principal
  const loanPrincipal = Math.max(0, taxableAmount + totalTax + licensingFee + financedLien - downPayment);

  // 5. Monthly Payment Formula
  const monthlyRate = apr / 100 / 12;
  let monthlyPayment = 0;

  if (apr > 0) {
    monthlyPayment = loanPrincipal *
      (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
      (Math.pow(1 + monthlyRate, termMonths) - 1);
  } else {
    monthlyPayment = loanPrincipal / termMonths;
  }

  // 6. Bi-Weekly Payment
  const biWeeklyPayment = (monthlyPayment * 12) / 26;

  // 7. Amortization Schedule (Bi-Weekly)
  const schedule = computeAmortization(loanPrincipal, apr, termMonths, biWeeklyPayment);

  const totalCost = loanPrincipal + schedule.reduce((sum, p) => sum + p.interest, 0);
  const totalInterest = totalCost - loanPrincipal;

  return {
    loanPrincipal,
    monthlyPayment,
    biWeeklyPayment,
    totalInterest,
    totalCost,
    hst: totalTax, // total combined tax returned in the 'hst' field for compatibility
    gst,
    pst,
    luxuryTax,
    licensingFee,
    maxTermAllowed,
    minApr,
    minDownPaymentRequired,
    isBankFinancable,
    schedule,
    maxVehiclePrice: Math.round(vehiclePrice),
    financedNegativeEquity,
    excessNegativeEquity,
    provinceCode: provCode,
    regulatingFee,
    regulatingFeeName: province.regulatingFeeName,
    dealerAdminFee: dealerAdmin,
    warranty: warrantyFee,
    safetyCertification: safetyFee,
    otherFees: otherFeeAmount,
  };
};

export interface ReverseInput {
  targetBiWeeklyPayment: number;
  targetMonthlyPayment: number;
  vehicleYear: number;
  tradeInValue: number;
  lienAmount: number;
  downPayment: number;
  termMonths: number;
  licensingFee: number;
  provinceCode?: string;
  vehicleCondition?: VehicleCondition;
  dealerAdminFee?: number;
  warranty?: number;
  safetyCertification?: number;
  otherFees?: number;
}

export const reverseCalculateAutoLoan = (input: ReverseInput): CalculationResult => {
  const { targetBiWeeklyPayment, targetMonthlyPayment, vehicleYear, tradeInValue, lienAmount, downPayment, termMonths, licensingFee, provinceCode, vehicleCondition, dealerAdminFee, warranty, safetyCertification, otherFees } = input;
  const monthlyTarget = targetMonthlyPayment > 0 ? targetMonthlyPayment : (targetBiWeeklyPayment * 26) / 12;

  const provCode = provinceCode || 'ON';
  const rules = getYearRules(vehicleYear);
  const term = Math.min(termMonths, rules.maxTermAllowed);
  const apr = rules.minApr;

  // Binary search for precision and safety under non-linear BC PST and Federal Luxury Tax curves
  let low = 0;
  let high = 2000000; // Cap search space at $2,000,000
  let bestPrice = 0;

  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    const netTradeEffect = lienAmount - tradeInValue;
    const negativeEquity = Math.max(0, netTradeEffect);
    const maxFinanceable = Math.round(mid * NEGATIVE_EQUITY_CAP);
    const excessNegativeEquity = Math.max(0, negativeEquity - maxFinanceable);
    const minDownRequiredOverall = Math.max(Math.round(mid * rules.minDownPaymentPct), excessNegativeEquity);

    const res = calculateAutoLoan({
      vehicleYear,
      vehiclePrice: mid,
      tradeInValue,
      lienAmount,
      downPayment: Math.max(downPayment, minDownRequiredOverall),
      apr,
      termMonths: term,
      licensingFee,
      provinceCode: provCode,
      vehicleCondition,
      dealerAdminFee,
      warranty,
      safetyCertification,
      otherFees,
    });

    if (res.monthlyPayment <= monthlyTarget) {
      bestPrice = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  const finalPrice = Math.round(bestPrice);
  const netTradeEffect = lienAmount - tradeInValue;
  const negativeEquity = Math.max(0, netTradeEffect);
  const maxFinanceable = Math.round(finalPrice * NEGATIVE_EQUITY_CAP);
  const excessNegativeEquity = Math.max(0, negativeEquity - maxFinanceable);
  const minDownRequiredOverall = Math.max(Math.round(finalPrice * rules.minDownPaymentPct), excessNegativeEquity);

  const forwardResult = calculateAutoLoan({
    vehicleYear,
    vehiclePrice: finalPrice,
    tradeInValue,
    lienAmount,
    downPayment: Math.max(downPayment, minDownRequiredOverall),
    apr,
    termMonths: term,
    licensingFee,
    provinceCode: provCode,
    vehicleCondition,
    dealerAdminFee,
    warranty,
    safetyCertification,
    otherFees,
  });

  return {
    ...forwardResult,
    maxVehiclePrice: finalPrice,
  };
};
