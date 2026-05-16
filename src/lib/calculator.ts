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

export interface CalculationInput {
  vehicleYear: number;
  vehiclePrice: number;
  tradeInValue: number;
  downPayment: number;
  apr: number;
  termMonths: number;
  licensingFee: number;
}

export interface CalculationResult {
  loanPrincipal: number;
  monthlyPayment: number;
  biWeeklyPayment: number;
  totalInterest: number;
  totalCost: number;
  hst: number;
  maxTermAllowed: number;
  minApr: number;
  minDownPaymentRequired: number;
  isBankFinancable: boolean;
  schedule: AmortizationPeriod[];
  maxVehiclePrice: number;
}

const HST_RATE = 0.13;
const OMVIC_FEE = 22.00; // 2026 Rate
const LICENSING_FEE = 56.00;
const ADMIN_FEE = 2000.00;

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
    return { maxTermAllowed: 60, minApr: 14.99, isBankFinancable: true, minDownPaymentPct: 0.10 };
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
  const { vehicleYear, vehiclePrice, tradeInValue, downPayment, apr, termMonths, licensingFee } = input;

  const rules = getYearRules(vehicleYear);
  const maxTermAllowed = rules.maxTermAllowed;
  const minApr = rules.minApr;
  const minDownPaymentRequired = vehiclePrice * rules.minDownPaymentPct;
  const isBankFinancable = rules.isBankFinancable;

  // 1. Calculate Taxable Amount
  const taxableAmount = Math.max(0, vehiclePrice - tradeInValue + ADMIN_FEE + OMVIC_FEE);

  // 2. Calculate Loan Principal
  const hst = taxableAmount * HST_RATE;
  const loanPrincipal = Math.max(0, taxableAmount + hst + licensingFee - downPayment);

  // 3. Monthly Payment Formula
  const monthlyRate = apr / 100 / 12;
  let monthlyPayment = 0;

  if (apr > 0) {
    monthlyPayment = loanPrincipal *
      (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
      (Math.pow(1 + monthlyRate, termMonths) - 1);
  } else {
    monthlyPayment = loanPrincipal / termMonths;
  }

  // 4. Bi-Weekly Payment
  const biWeeklyPayment = (monthlyPayment * 12) / 26;

  // 5. Amortization Schedule (Bi-Weekly)
  const schedule = computeAmortization(loanPrincipal, apr, termMonths, biWeeklyPayment);

  const totalCost = loanPrincipal + schedule.reduce((sum, p) => sum + p.interest, 0);
  const totalInterest = totalCost - loanPrincipal;

  return {
    loanPrincipal,
    monthlyPayment,
    biWeeklyPayment,
    totalInterest,
    totalCost,
    hst,
    maxTermAllowed,
    minApr,
    minDownPaymentRequired,
    isBankFinancable,
    schedule,
    maxVehiclePrice: vehiclePrice
  };
};

export interface ReverseInput {
  targetBiWeeklyPayment: number;
  targetMonthlyPayment: number;
  vehicleYear: number;
  tradeInValue: number;
  downPayment: number;
  licensingFee: number;
}

export const reverseCalculateAutoLoan = (input: ReverseInput): CalculationResult => {
  const { targetBiWeeklyPayment, targetMonthlyPayment, vehicleYear, tradeInValue, downPayment, licensingFee } = input;
  const monthlyTarget = targetMonthlyPayment > 0 ? targetMonthlyPayment : (targetBiWeeklyPayment * 26) / 12;
  const rules = getYearRules(vehicleYear);
  const r = rules.minApr / 100 / 12;
  const n = rules.maxTermAllowed;
  let loanPrincipal: number;
  if (rules.minApr > 0) {
    const pow = Math.pow(1 + r, n);
    loanPrincipal = monthlyTarget * (pow - 1) / (r * pow);
  } else {
    loanPrincipal = monthlyTarget * n;
  }
  const constants = (tradeInValue - 2000.00 - 22.00) * 1.13;
  let maxPrice: number;
  if (rules.minDownPaymentPct > 0) {
    const effectiveDown = Math.max(downPayment, 0);
    const taxableNoMin = (loanPrincipal + effectiveDown - licensingFee) / 1.13;
    const priceNoMin = taxableNoMin + tradeInValue - 2000.00 - 22.00;
    const minDownRequired = priceNoMin * rules.minDownPaymentPct;
    if (effectiveDown >= minDownRequired) {
      maxPrice = priceNoMin;
    } else {
      maxPrice = (loanPrincipal - licensingFee + constants) / (1.13 - rules.minDownPaymentPct);
    }
  } else {
    const taxableAmount = (loanPrincipal + downPayment - licensingFee) / 1.13;
    maxPrice = taxableAmount + tradeInValue - 2000.00 - 22.00;
  }
  maxPrice = Math.max(0, Math.round(maxPrice * 100) / 100);
  const forwardResult = calculateAutoLoan({
    vehicleYear, vehiclePrice: maxPrice, tradeInValue,
    downPayment: Math.max(downPayment, maxPrice * rules.minDownPaymentPct),
    apr: rules.minApr, termMonths: rules.maxTermAllowed, licensingFee,
  });
  return { ...forwardResult, maxVehiclePrice: maxPrice };
};
