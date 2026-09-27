/**
 * Desjardins AUTO financing Ontario — reserve-backed rate availability.
 *
 * Source: "Desjardins AUTO financing Ontario" rate sheet in effect from
 * September 8 to October 4, 2026 (DealerTrack ProgramId 23966, LenderId DSJ).
 *
 * The sheet's reserve grid doubles as the quote-eligibility grid: where a
 * rate has no reserve for a financed-amount bracket (blank / "N/A" on the
 * sheet), that rate is not offered. A missing bracket entry here therefore
 * means "no reserve -> rate unavailable", not "reserve of 0%".
 */

export interface ReserveBracket {
  id: string;
  min: number;
  max: number; // inclusive upper bound; Infinity for the top bracket
}

export interface DesjardinsFixedRow {
  /** APR for terms up to 84 months */
  baseApr: number;
  /** APR for terms of 85+ months ("85 months +" column) */
  extendedApr: number;
  /** Reserve % per amount bracket; omitted bracket = no reserve = not offered */
  reserves: Record<string, number>;
}

export interface DesjardinsPromoRow {
  apr: number;
  minYear: number;
  maxYear: number;
  /** Promo terms carry "no increase" at 85+ months, so a single APR */
  reserves: Record<string, number>;
}

export interface AvailableRate {
  apr: number;
  /** Reserve % of amount financed; always > 0 (zero-reserve rates are excluded) */
  reservePct: number;
  kind: 'promo' | 'fixed';
}

// Amount-financed brackets from the sheet's reserve grid. A new or demo
// vehicle must have under 10,000 km; salvage/rebuilt are ineligible (not
// modelled here).
export const RESERVE_BRACKETS: ReserveBracket[] = [
  { id: 'b7500', min: 7500, max: 14999 },
  { id: 'b15000', min: 15000, max: 19999 },
  { id: 'b20000', min: 20000, max: 24999 },
  { id: 'b25000', min: 25000, max: 29999 },
  { id: 'b30000', min: 30000, max: 39999 },
  { id: 'b40000', min: 40000, max: 49999 },
  { id: 'b50000', min: 50000, max: 74999 },
  { id: 'b75000', min: 75000, max: Infinity },
];

// FIXED RATE - 2016 to 2027 ("RESERVES AND BONUS" grid)
export const FIXED_RATE_ROWS: DesjardinsFixedRow[] = [
  { baseApr: 7.99, extendedApr: 8.99, reserves: { b20000: 1.00, b25000: 1.15, b30000: 1.70, b40000: 2.40, b50000: 2.45, b75000: 2.50 } },
  { baseApr: 8.49, extendedApr: 9.49, reserves: { b20000: 1.10, b25000: 1.30, b30000: 2.20, b40000: 2.60, b50000: 2.70, b75000: 2.75 } },
  { baseApr: 8.99, extendedApr: 9.99, reserves: { b20000: 2.40, b25000: 3.00, b30000: 3.80, b40000: 3.90, b50000: 3.95 } },
  { baseApr: 9.49, extendedApr: 10.49, reserves: { b7500: 0.75, b15000: 0.95, b20000: 2.50, b25000: 3.20, b30000: 3.90, b40000: 3.95 } },
  { baseApr: 9.99, extendedApr: 10.99, reserves: { b7500: 1.25, b15000: 1.50, b20000: 2.75, b25000: 3.30, b30000: 3.95, b40000: 4.00 } },
];

// PROMO grid: minimum financed amount is the lowest bracket with a reserve
// ($25,000 on the current sheet). Reserve column order: 25k / 30k / 40k / 50k / 75k+.
export const PROMO_RATE_ROWS: DesjardinsPromoRow[] = [
  { apr: 6.95, minYear: 2021, maxYear: 2027, reserves: { b25000: 0.25, b30000: 0.75, b40000: 0.80, b50000: 0.85, b75000: 0.90 } },
  { apr: 7.45, minYear: 2019, maxYear: 2027, reserves: { b25000: 0.50, b30000: 1.00, b40000: 1.10, b50000: 1.20, b75000: 1.30 } },
];

// "2018 or older vehicles: a rate premium of 2%"
export const OLDER_VEHICLE_PREMIUM_PCT = 2;
const OLD_MODEL_CUTOFF_YEAR = 2018;

// Sheet only finances 2016-2027 models
export const MIN_MODEL_YEAR = 2016;
export const MAX_MODEL_YEAR = 2027;
// "Minimum term applicable of 24 months on any financing"
export const MIN_TERM_MONTHS = 24;
// Fixed table's term split ("Up to 84 months" vs "85 months +")
export const EXTENDED_TERM_THRESHOLD = 84;

/** Sheet's amortization table: maximum term by model year (0 = not eligible). */
export function desjardinsMaxTerm(vehicleYear: number): number {
  if (vehicleYear >= 2024 && vehicleYear <= MAX_MODEL_YEAR) return 96;
  if (vehicleYear >= 2021) return 84;
  if (vehicleYear === 2020) return 72;
  if (vehicleYear === 2019) return 60;
  if (vehicleYear === 2018) return 48;
  if (vehicleYear >= 2016) return 36;
  return 0;
}

export function bracketFor(amountFinanced: number): ReserveBracket | null {
  if (amountFinanced < RESERVE_BRACKETS[0].min) return null;
  return RESERVE_BRACKETS.find((b) => amountFinanced >= b.min && amountFinanced <= b.max) ?? null;
}

function reserveInBracket(reserves: Record<string, number>, bracket: ReserveBracket | null): number | null {
  if (!bracket) return null;
  const pct = reserves[bracket.id];
  return typeof pct === 'number' && pct > 0 ? pct : null;
}

function withOldModelPremium(apr: number, vehicleYear: number): number {
  return vehicleYear <= OLD_MODEL_CUTOFF_YEAR
    ? Math.round((apr + OLDER_VEHICLE_PREMIUM_PCT) * 100) / 100
    : apr;
}

/**
 * All Desjardins rates that carry a reserve for this exact deal
 * (amount financed, model year, term, province). Sorted by APR ascending.
 * Returns [] when Desjardins cannot finance the deal at all.
 */
export function availableDesjardinsRates(
  amountFinanced: number,
  vehicleYear: number,
  termMonths: number,
  provinceCode: string = 'ON',
): AvailableRate[] {
  if (provinceCode !== 'ON') return []; // sheet is Ontario-only
  if (amountFinanced < RESERVE_BRACKETS[0].min) return [];
  if (vehicleYear < MIN_MODEL_YEAR || vehicleYear > MAX_MODEL_YEAR) return [];
  const maxTerm = desjardinsMaxTerm(vehicleYear);
  if (maxTerm === 0 || termMonths > maxTerm) return [];
  if (termMonths < MIN_TERM_MONTHS) return [];

  const bracket = bracketFor(amountFinanced);
  const out = new Map<number, AvailableRate>();

  for (const row of FIXED_RATE_ROWS) {
    const apr = withOldModelPremium(termMonths > EXTENDED_TERM_THRESHOLD ? row.extendedApr : row.baseApr, vehicleYear);
    const reservePct = reserveInBracket(row.reserves, bracket);
    if (reservePct === null) continue;
    const prev = out.get(apr);
    if (!prev || prev.reservePct < reservePct) out.set(apr, { apr, reservePct, kind: 'fixed' });
  }

  for (const row of PROMO_RATE_ROWS) {
    if (vehicleYear < row.minYear || vehicleYear > row.maxYear) continue;
    const reservePct = reserveInBracket(row.reserves, bracket);
    if (reservePct === null) continue;
    const prev = out.get(row.apr);
    if (!prev || prev.reservePct < reservePct) out.set(row.apr, { apr: row.apr, reservePct, kind: 'promo' });
  }

  return [...out.values()].sort((a, b) => a.apr - b.apr);
}

/**
 * Reserve % the sheet pays for this APR on this deal, or null when the APR
 * is not one of the sheet's rates or has no reserve (N/A) at this amount.
 */
export function desjardinsReserveFor(
  apr: number,
  amountFinanced: number,
  vehicleYear: number,
  termMonths: number,
  provinceCode: string = 'ON',
): number | null {
  const match = availableDesjardinsRates(amountFinanced, vehicleYear, termMonths, provinceCode)
    .find((r) => Math.abs(r.apr - apr) < 0.005);
  return match ? match.reservePct : null;
}
