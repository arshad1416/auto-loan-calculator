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
}

const HST_RATE = 0.13;
const OMVIC_FEE = 22.00; // 2026 Rate
const LICENSING_FEE = 56.00;
const ADMIN_FEE = 2000.00;

export const calculateAutoLoan = (input: CalculationInput): CalculationResult => {
  const { vehicleYear, vehiclePrice, tradeInValue, downPayment, apr, termMonths } = input;
  
  // Rule Definitions
  let maxTermAllowed = 84; 
  let minApr = 6.99;
  let minDownPaymentRequired = 0;
  let isBankFinancable = true;

  if (vehicleYear >= 2023) {
    maxTermAllowed = 84;
    minApr = 6.99;
  } else if (vehicleYear >= 2021) {
    maxTermAllowed = 72;
    minApr = 7.99;
  } else if (vehicleYear >= 2016) {
    maxTermAllowed = 60;
    minApr = 8.99;
  } else if (vehicleYear >= 2010) {
    maxTermAllowed = 60;
    minApr = 14.99;
    minDownPaymentRequired = vehiclePrice * 0.10;
  } else {
    isBankFinancable = false;
    maxTermAllowed = 48;
    minApr = 19.99;
  }

  // 1. Calculate Taxable Amount
  const taxableAmount = Math.max(0, vehiclePrice - tradeInValue + ADMIN_FEE + OMVIC_FEE);
  
  // 2. Calculate Loan Principal
  const hst = taxableAmount * HST_RATE;
  const loanPrincipal = Math.max(0, taxableAmount + hst + LICENSING_FEE - downPayment);

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
    schedule
  };
};
