/**
 * Auto Loan Calculator Logic
 * Factors in Ontario-specific taxes (HST 13%), OMVIC fees, lender admin fees, and dealer admin fees.
 * Financing rules sourced from Canadian lender guidelines. Rates, terms and conditions last
 * re-checked 2026-11-15 against current lender rate sheets and booking guides (effective Mar-Nov 2026)
 * and the 20 most recent funded contracts.
 */

import { availableDesjardinsRates, desjardinsReserveFor, desjardinsMaxTerm, type AvailableRate } from './desjardins';

export interface AmortizationPeriod {
  period: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
  extraPayment?: number;
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
  lenderAdminFee?: number;
  dealerAdminFee?: number;
  ppsaFee?: number;
  warranty?: number;
  safetyCertification?: number;
  otherFees?: number;
  /** Optional insurance products (GAP / Life / A&H) financed on the deal */
  insuranceProducts?: number;
  /** Customer accepts a subprime rate in exchange for a term past the prime lender's limit */
  acceptsSubprime?: boolean;
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
  financingTier: string; // e.g. "Prime", "Limited", "Specialty"
  schedule: AmortizationPeriod[];
  maxVehiclePrice: number;
  financedNegativeEquity: number;
  excessNegativeEquity: number;
  provinceCode?: string;
  regulatingFee?: number;
  regulatingFeeName?: string;
  lenderAdminFee: number;
  dealerAdminFee: number;
  ppsaFee: number;
  warranty: number;
  safetyCertification: number;
  otherFees: number;
  /** Insurance products financed on the deal (GAP / Life / A&H) */
  insuranceProducts: number;
  /** Tax on insurance premiums: 0 everywhere except QC (9% QST) */
  insuranceTax: number;
  /** Desjardins rates the sheet backs with a reserve at this amount/year/term */
  availableAprs: AvailableRate[];
  /** Reserve % for the chosen APR, or null when it has no reserve / is off-sheet */
  desjardinsReservePct: number | null;
  /** Desjardins sheet amortization cap for this year (0 = Desjardins not applicable) */
  desjardinsMaxTerm: number;
  /** True when a subprime placement allows a longer term than the prime limit for this deal */
  subprimeAvailable: boolean;
  /** Longest term on prime placement (equals maxTermAllowed while subprime is off) */
  primeMaxTerm: number;
  /** Longest term when the customer accepts subprime (0 when no subprime extension exists) */
  subprimeMaxTerm: number;
  /** True when the quote is on the subprime extension (accepted and available) */
  isSubprime: boolean;
  /** Starting subprime rate for this model year */
  subprimeApr: number;
}

/** Rounds a dollar amount to the nearest cent. */
const toCents = (amount: number): number => Math.round(amount * 100) / 100;

const NEGATIVE_EQUITY_CAP = 0.40; // Max % of vehicle price that can be rolled in as negative equity

/**
 * PPSA / government security-registration fee, financed on every contract reviewed.
 * APPROXIMATE — the actual fee varies by lender and term. Observed across 20 signed 2026 contracts:
 * $32-$99 (National Bank $32-$88 government portion, Northlake $99, Santander/CIBC $60.25).
 * Override per deal rather than relying on this default.
 */
const DEFAULT_PPSA_FEE = 60;

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

/**
 * Subprime longer-term option.
 *
 * In ON the prime lender (Desjardins) caps the term by model year (desjardinsMaxTerm). A customer
 * who accepts a subprime rate can go to the longest term any subprime lender on the panel books for
 * that model year. Source: year x condition-grade booking guides in the lender policy library
 * (AutoCapital eff. 2026-04-03, EdenPark 2026 Ride eff. 2026-07-01, Quantifi National,
 * Santander Tier 2026-04). Longest term across lenders and grades, i.e. a low-mileage unit; heavier
 * mileage books shorter. Every subprime sheet caps at 84 months.
 */
export const SUBPRIME_MIN_YEAR = 2016;
export const SUBPRIME_MAX_TERM = 84;

/** Longest subprime term for a model year (0 = not offered). */
export function subprimeMaxTermForYear(vehicleYear: number): number {
  if (vehicleYear >= 2021) return SUBPRIME_MAX_TERM; // all four lenders: 84 (Extra Clean / Clean)
  if (vehicleYear >= 2019) return 78; // 2020: ACC/EP/QLI/SAN Extra Clean 78; 2019: QLI Extra Clean 78
  if (vehicleYear === 2018) return 60; // QLI Clean 60 (Santander 54, ACC/EP 48)
  if (vehicleYear === 2017) return 48; // EP/QLI Clean 48 (Santander 42, ACC 36)
  if (vehicleYear === SUBPRIME_MIN_YEAR) return 60; // owner's figure, 2026-11-16 (sheets on file: QLI 42, EP 36)
  return 0;
}
// Starting subprime rate for every eligible year: owner's figure (2026-11-16).
export const SUBPRIME_APR = 12.9;

export interface TermLimits {
  maxTermAllowed: number;
  primeMaxTerm: number;
  subprimeMaxTerm: number;
  subprimeAvailable: boolean;
  isSubprime: boolean;
}

export function getTermLimits(
  vehicleYear: number,
  vehicleCondition: VehicleCondition | undefined,
  provinceCode: string | undefined,
  acceptsSubprime: boolean | undefined,
): TermLimits {
  const panelMax = getYearRules(vehicleYear, vehicleCondition).maxTermAllowed;
  const primeCap = (provinceCode || 'ON') === 'ON' ? desjardinsMaxTerm(vehicleYear) : 0;
  const subprimeTerm = subprimeMaxTermForYear(vehicleYear);
  const subprimeAvailable = primeCap > 0 && subprimeTerm > primeCap;
  // With the option offered, prime placement means the prime lender's own limit.
  const primeMaxTerm = subprimeAvailable ? Math.min(panelMax, primeCap) : panelMax;
  const subprimeMaxTerm = subprimeAvailable ? subprimeTerm : 0;
  const isSubprime = !!acceptsSubprime && subprimeAvailable;
  return {
    maxTermAllowed: isSubprime ? subprimeMaxTerm : primeMaxTerm,
    primeMaxTerm,
    subprimeMaxTerm,
    subprimeAvailable,
    isSubprime,
  };
}

interface YearRules {
  maxTermAllowed: number;
  minApr: number;
  isBankFinancable: boolean;
  financingTier: string;
  minDownPaymentPct: number;
}

export function getYearRules(vehicleYear: number, vehicleCondition?: VehicleCondition): YearRules {
  const currentYear = 2026;

  // New / low-km vehicles: 2024-2026
  if (vehicleCondition === 'new' && vehicleYear >= 2024 && vehicleYear <= currentYear) {
    // 6.95%: promotional fixed rate for 2023-2027 models, up to 96 months (prime rate sheet eff. 2026-11-03).
    return { maxTermAllowed: 96, minApr: 6.95, isBankFinancable: true, financingTier: 'Prime', minDownPaymentPct: 0 };
  }

  // Used 2023-2026 — 96mo: CIBC Auto Finance publishes up to 96 months on new OR used through the
  // dealer channel, vehicle up to 10 years old, with "maximum term must equal amortization" (so it is
  // a true 96-month contract, not a long amortization on a short term). TD is consistent.
  // NOTE: every subprime sheet on the panel caps at 84, so 96 is reachable only on prime-tier
  // placements. Because the reducer snaps term to this maximum on a year change, 96 also becomes the
  // default quote for a 2023+ — see calculator-reducer SET_YEAR.
  if (vehicleYear >= 2023) {
    // 6.95%: promotional fixed rate for 2023-2027 models, up to 96 months (prime rate sheet eff. 2026-11-03).
    return { maxTermAllowed: 96, minApr: 6.95, isBankFinancable: true, financingTier: 'Prime', minDownPaymentPct: 0 };
  }

  // 2021-2022
  if (vehicleYear >= 2021) {
    // 6.99%: two 2021 units funded at 6.99% in Sep 2026 (one at 188,000 km).
    return { maxTermAllowed: 84, minApr: 6.99, isBankFinancable: true, financingTier: 'Prime', minDownPaymentPct: 0 };
  }

  // 2019-2020 — 7.99% observed on National Bank contracts (2026)
  if (vehicleYear >= 2019) {
    // 84: a 2020 was written at 84 months by National Bank (2026 contract).
    return { maxTermAllowed: 84, minApr: 7.99, isBankFinancable: true, financingTier: 'Prime', minDownPaymentPct: 0 };
  }

  // 2018 — 8.99% observed on National Bank contracts (2026)
  if (vehicleYear >= 2018) {
    // 72: a 2018 was written at 72 months by Northlake, and Northlake's Apr-2026 booking
    // guide still allows 72 on a 2018 Extra Clean (0-100,000 km).
    // 7.99%: a 2018 funded at 7.99% in Sep 2026. 72 months still holds on the Apr-2026 booking guide
    // (2018, up to 100,000 km).
    return { maxTermAllowed: 72, minApr: 7.99, isBankFinancable: true, financingTier: 'Prime', minDownPaymentPct: 0 };
  }

  // 2017 — bank financable: National Bank funded a 2017 at 8.99% (2026)
  if (vehicleYear >= 2017) {
    // 60: Northlake (Apr 2026) and iA (May 2025) both cap a 2017 at 60 months on Clean.
    // Bank financable: National Bank funded a 2017 at 8.99% (2026 contract).
    // 8.49%: a 2017 funded at 8.49% in Oct 2026.
    return { maxTermAllowed: 60, minApr: 8.49, isBankFinancable: true, financingTier: 'Prime', minDownPaymentPct: 0.05 };
  }

  // 2015-2016 — bank financable: National Bank (2015) and CIBC (2016) both funded (2026).
  // 2016 — 9.99% quoted to be safe (owner, 2026-11-16), though a 2016 funded at 8.99% in Nov 2026 (244,000 km, 36 months). 48 months is the
  // longest on the current booking guides (up to 140,000 km).
  if (vehicleYear >= 2016) {
    return { maxTermAllowed: 48, minApr: 9.99, isBankFinancable: true, financingTier: 'Prime', minDownPaymentPct: 0.10 };
  }

  // 2015 — 9.59%: lowest 2015 funded in 2026 (Aug, 36 months); others at 9.99% and 11.49%.
  if (vehicleYear >= 2015) {
    // 48: Northlake (Apr 2026) and iA (May 2025) both allow 48 on a 2015/2016 Clean.
    // 9.99% observed on both the 2015 (National Bank) and 2016 (CIBC) contracts.
    // Bank financable: National Bank funded a 2015, CIBC funded a 2016 (2026 contracts).
    return { maxTermAllowed: 48, minApr: 9.59, isBankFinancable: true, financingTier: 'Prime', minDownPaymentPct: 0.10 };
  }

  // 2012-2014 — 42mo: Quantifi's Vintage grid (2011-2015 Clean, <=125,000 km) allows 42, and a live
  // Northlake DealerCenter test on a 2013 returned a 42-month maximum. The previous 72mo/16.90%
  // came from a LendCare contract; LendCare has since exited auto finance, so it no longer
  // describes anything placeable. 12.95% is Rifco's published Sunset floor.
  if (vehicleYear >= 2012) {
    return { maxTermAllowed: 42, minApr: 12.95, isBankFinancable: false, financingTier: 'Specialty', minDownPaymentPct: 0.25 };
  }

  // 2011 & older — 36mo kept: sits between Quantifi's 2006-2010 Vintage band (30) and its
  // 2011-2015 band (42). Coarse bucket; a 2011 and a 2006 are not really the same deal.
  // Nothing on the panel finances below 2006. 12.95% is Rifco's published Sunset floor.
  return { maxTermAllowed: 36, minApr: 12.95, isBankFinancable: false, financingTier: 'Specialty', minDownPaymentPct: 0.50 };
}

export function computeAmortization(
  loanPrincipal: number, apr: number, termMonths: number, biWeeklyPayment: number
): AmortizationPeriod[] {
  const schedule: AmortizationPeriod[] = [];
  const biWeeklyRate = apr / 100 / 26;
  const totalPeriods = Math.min((termMonths / 12) * 26, 1000);
  let currentBalance = loanPrincipal;

  for (let i = 1; i <= totalPeriods; i++) {
    const interestPayment = currentBalance * biWeeklyRate;
    // Never negative: at extreme rates rounding can leave the payment a hair under the interest.
    const principalPayment = Math.max(0, Math.min(currentBalance, biWeeklyPayment - interestPayment));
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

export function computeLumpSumAmortization(
  loanPrincipal: number, apr: number, termMonths: number, biWeeklyPayment: number, extraPayments: Record<number, number>
): { schedule: AmortizationPeriod[]; periodsSaved: number; interestSaved: number } {
  const schedule: AmortizationPeriod[] = [];
  const biWeeklyRate = apr / 100 / 26;
  const maxPeriods = (termMonths / 12) * 26;
  let currentBalance = loanPrincipal;
  let totalInterestPaid = 0;

  for (let i = 1; i <= maxPeriods; i++) {
    const interestPayment = currentBalance * biWeeklyRate;
    const standardPrincipal = Math.max(0, Math.min(currentBalance, biWeeklyPayment - interestPayment));
    const extraAmount = extraPayments[i] || 0;
    const totalPrincipal = Math.min(currentBalance, standardPrincipal + extraAmount);
    const actualPayment = standardPrincipal + interestPayment + extraAmount;
    currentBalance = Math.max(0, currentBalance - totalPrincipal);
    totalInterestPaid += interestPayment;
    schedule.push({
      period: i,
      payment: actualPayment,
      principal: totalPrincipal,
      interest: interestPayment,
      balance: currentBalance,
      extraPayment: extraAmount > 0 ? extraAmount : undefined,
    });
    if (currentBalance <= 0) break;
  }

  // Calculate original schedule for comparison
  const originalSchedule = computeAmortization(loanPrincipal, apr, termMonths, biWeeklyPayment);
  const originalInterest = originalSchedule.reduce((sum, p) => sum + p.interest, 0);
  const periodsSaved = originalSchedule.length - schedule.length;
  const interestSaved = originalInterest - totalInterestPaid;

  return { schedule, periodsSaved, interestSaved };
}

export const calculateAutoLoan = (input: CalculationInput): CalculationResult => {
  const { vehicleYear, vehiclePrice, tradeInValue, lienAmount, downPayment, apr, termMonths, licensingFee, provinceCode, vehicleCondition, lenderAdminFee, dealerAdminFee, ppsaFee, warranty, safetyCertification, otherFees, insuranceProducts } = input;

  const rules = getYearRules(vehicleYear, input.vehicleCondition);
  const provCode = provinceCode || 'ON';
  // Desjardins sheet amortization cap for this year (informational: the rate
  // list empties past it; maxTermAllowed stays the panel-wide guideline).
  const desjardinsCap = provCode === 'ON' ? desjardinsMaxTerm(vehicleYear) : 0;
  const limits = getTermLimits(vehicleYear, vehicleCondition, provCode, input.acceptsSubprime);
  const maxTermAllowed = limits.maxTermAllowed;
  const subprimeApr = SUBPRIME_APR;
  const minApr = limits.isSubprime ? subprimeApr : rules.minApr;
  const isBankFinancable = rules.isBankFinancable;

  const province = PROVINCES.find(p => p.code === provCode) || PROVINCES[0];
  const regulatingFee = province.regulatingFee;

  // Lender (bank) admin fee defaults to $2,000 in ON, $0 elsewhere
  const lenderAdmin = lenderAdminFee ?? (provCode === 'ON' ? 2000 : 0);
  const dealerAdmin = dealerAdminFee ?? 0;
  // PPSA is a government registration fee: financed, but not taxable (same treatment as licensing).
  const ppsa = ppsaFee ?? DEFAULT_PPSA_FEE;
  const warrantyFee = warranty ?? 0;
  const safetyFee = safetyCertification ?? 0;
  const otherFeeAmount = otherFees ?? 0;

  // Insurance products (GAP / Life / A&H) — per CRA and provincial rules:
  // A contract of insurance is an EXEMPT supply under the Excise Tax Act
  // (Schedule V), so no GST/HST applies federally. Provincial PST/RST does
  // not apply to insurance premiums either — insurers remit insurance
  // premium tax instead. OMVIC's all-in-price rules (ON) treat these as
  // optional products outside the taxable vehicle price. Quebec is the
  // exception: a specific 9% QST applies to insurance contracts.
  const insuranceTotal = insuranceProducts ?? 0;
  const insuranceTax = provCode === 'QC' ? insuranceTotal * 0.09 : 0;

  // Calculate Federal Luxury Tax: Lesser of 10% of total price or 20% of amount over $100,000
  // CRA: Applies to NEW vehicles only, based on the retail sale price (not admin or regulatory fees)
  const isNew = vehicleCondition === 'new';
  const luxuryTax = (isNew && vehiclePrice > 100000) ? Math.min(vehiclePrice * 0.10, (vehiclePrice - 100000) * 0.20) : 0;

  // 1. Calculate Taxable Amount (trade-in reduces base; luxury tax is taxable; all additional fees/products are taxable)
  const taxableAmount = Math.max(0, vehiclePrice - tradeInValue + lenderAdmin + dealerAdmin + regulatingFee + luxuryTax + warrantyFee + safetyFee + otherFeeAmount);

  // 2. Net equity from trade: negative = positive equity (reduces loan), positive = negative equity
  const netTradeEffect = lienAmount - tradeInValue;
  const maxFinanceableNegativeEquity = Math.round(vehiclePrice * NEGATIVE_EQUITY_CAP);
  
  const negativeEquity = Math.max(0, netTradeEffect);
  const financedNegativeEquity = Math.min(negativeEquity, maxFinanceableNegativeEquity);
  const excessNegativeEquity = Math.max(0, negativeEquity - maxFinanceableNegativeEquity);
  const financedLien = lienAmount - excessNegativeEquity;

  // Net positive equity from trade counts toward minimum down payment
  const netTradeEquity = Math.max(0, tradeInValue - lienAmount);
  const minDownPaymentRequired = Math.max(
    0,
    Math.round(vehiclePrice * rules.minDownPaymentPct) - netTradeEquity,
    excessNegativeEquity,
  );

  // 3. Calculate Sales Taxes
  const pstRate = provCode === 'BC' ? getBcPstRate(vehiclePrice) : province.pstRate;
  const gst = province.taxType === 'HST' ? 0 : taxableAmount * province.gstRate;
  const pst = province.taxType === 'HST' ? 0 : taxableAmount * pstRate;
  const hstAmount = province.taxType === 'HST' ? taxableAmount * province.pstRate : 0;
  const totalTax = gst + pst + hstAmount + insuranceTax;

  // 4. Calculate Loan Principal — the insurance premium is financed; in QC
  // its 9% QST is already part of totalTax above
  const loanPrincipal = Math.max(0, taxableAmount + totalTax + licensingFee + ppsa + financedLien - downPayment + insuranceTotal);

  // 4b. Desjardins rate availability: the sheet's reserve grid gates which APRs
  // are quotable — rates with no reserve at this amount/year/term are excluded.
  const availableAprs = availableDesjardinsRates(loanPrincipal, vehicleYear, termMonths, provCode);
  const desjardinsReservePct = desjardinsReserveFor(apr, loanPrincipal, vehicleYear, termMonths, provCode);

  // 5. Monthly Payment Formula
  const monthlyRate = apr / 100 / 12;
  let monthlyPayment = 0;

  if (apr > 0) {
    const growth = Math.pow(1 + monthlyRate, termMonths);
    // At absurd rates the growth factor overflows; the formula's limit there is interest-only.
    monthlyPayment = Number.isFinite(growth)
      ? loanPrincipal * (monthlyRate * growth) / (growth - 1)
      : loanPrincipal * monthlyRate;
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
    financingTier: limits.isSubprime ? 'Subprime' : rules.financingTier,
    schedule,
    maxVehiclePrice: toCents(vehiclePrice),
    financedNegativeEquity,
    excessNegativeEquity,
    provinceCode: provCode,
    regulatingFee,
    regulatingFeeName: province.regulatingFeeName,
    lenderAdminFee: lenderAdmin,
    dealerAdminFee: dealerAdmin,
    ppsaFee: ppsa,
    warranty: warrantyFee,
    safetyCertification: safetyFee,
    otherFees: otherFeeAmount,
    insuranceProducts: insuranceTotal,
    insuranceTax,
    availableAprs,
    desjardinsReservePct,
    desjardinsMaxTerm: desjardinsCap,
    subprimeAvailable: limits.subprimeAvailable,
    primeMaxTerm: limits.primeMaxTerm,
    subprimeMaxTerm: limits.subprimeMaxTerm,
    isSubprime: limits.isSubprime,
    subprimeApr,
  };
};

export interface ReverseInput {
  targetBiWeeklyPayment: number;
  targetMonthlyPayment: number;
  vehicleYear: number;
  tradeInValue: number;
  lienAmount: number;
  downPayment: number;
  apr?: number;
  termMonths: number;
  licensingFee: number;
  provinceCode?: string;
  vehicleCondition?: VehicleCondition;
  lenderAdminFee?: number;
  dealerAdminFee?: number;
  ppsaFee?: number;
  warranty?: number;
  safetyCertification?: number;
  otherFees?: number;
  /** Optional insurance products (GAP / Life / A&H) financed on the deal */
  insuranceProducts?: number;
  acceptsSubprime?: boolean;
}

export const reverseCalculateAutoLoan = (input: ReverseInput): CalculationResult => {
  const { targetBiWeeklyPayment, targetMonthlyPayment, vehicleYear, tradeInValue, lienAmount, downPayment, termMonths, licensingFee, provinceCode, vehicleCondition, lenderAdminFee, dealerAdminFee, ppsaFee, warranty, safetyCertification, otherFees, insuranceProducts } = input;
  const monthlyTarget = targetMonthlyPayment > 0 ? targetMonthlyPayment : (targetBiWeeklyPayment * 26) / 12;

  const provCode = provinceCode || 'ON';
  // Term is condition-based.
  const rules = getYearRules(vehicleYear, input.vehicleCondition);
  const limits = getTermLimits(vehicleYear, vehicleCondition, provCode, input.acceptsSubprime);
  const term = Math.min(termMonths, limits.maxTermAllowed);
  const apr = input.apr ?? (limits.isSubprime ? SUBPRIME_APR : rules.minApr);

  // Binary search for precision and safety under non-linear BC PST and Federal Luxury Tax curves
  let low = 0;
  let high = 2000000; // Cap search space at $2,000,000
  let bestPrice = 0;

  // 40 halvings of $2,000,000 land well inside a cent.
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    const netTradeEffect = lienAmount - tradeInValue;
    const negativeEquity = Math.max(0, netTradeEffect);
    const maxFinanceable = Math.round(mid * NEGATIVE_EQUITY_CAP);
    const excessNegativeEquity = Math.max(0, negativeEquity - maxFinanceable);
    const netTradeEquity = Math.max(0, tradeInValue - lienAmount);
    const minDownRequiredOverall = Math.max(0, Math.round(mid * rules.minDownPaymentPct) - netTradeEquity, excessNegativeEquity);

    let res: CalculationResult;
    try {
      res = calculateAutoLoan({
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
        lenderAdminFee,
        dealerAdminFee,
        ppsaFee,
        warranty,
        safetyCertification,
        otherFees,
        insuranceProducts,
        acceptsSubprime: input.acceptsSubprime,
      });
    } catch {
      break;
    }

    if (res.monthlyPayment <= monthlyTarget) {
      bestPrice = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  // Whole cents, rounded down so the payment never passes the target. The minimum down payment and
  // the negative-equity cap are whole-dollar figures that step as the price moves, so the payment
  // is re-checked at the chosen cent and walked down if a step pushed it over.
  const quote = (vehiclePrice: number) => {
    const maxFinanceable = Math.round(vehiclePrice * NEGATIVE_EQUITY_CAP);
    const excess = Math.max(0, Math.max(0, lienAmount - tradeInValue) - maxFinanceable);
    const minDown = Math.max(
      0,
      Math.round(vehiclePrice * rules.minDownPaymentPct) - Math.max(0, tradeInValue - lienAmount),
      excess,
    );
    return calculateAutoLoan({
      vehicleYear,
      vehiclePrice,
      tradeInValue,
      lienAmount,
      downPayment: Math.max(downPayment, minDown),
      apr,
      termMonths: term,
      licensingFee,
      provinceCode: provCode,
      vehicleCondition,
      lenderAdminFee,
      dealerAdminFee,
      ppsaFee,
      warranty,
      safetyCertification,
      otherFees,
      insuranceProducts,
      acceptsSubprime: input.acceptsSubprime,
    });
  };

  let finalPrice = Math.floor(bestPrice * 100) / 100;
  for (let step = 0; step < 200 && finalPrice > 0 && quote(finalPrice).monthlyPayment > monthlyTarget; step++) {
    finalPrice = toCents(finalPrice - 0.01);
  }

  const forwardResult = quote(finalPrice);

  return {
    ...forwardResult,
    maxVehiclePrice: finalPrice,
  };
};
