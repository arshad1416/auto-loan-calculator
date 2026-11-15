/**
 * CompCeiling's public Ontario market index: typical asking prices for the province's most-listed
 * used vehicles. Market totals only. It carries no dealers, listings, or VINs.
 */

export const MARKET_SITE = 'https://compceiling.com';
export const MARKET_INDEX_PAGE = `${MARKET_SITE}/market-index`;
export const MARKET_INDEX_API = `${import.meta.env.VITE_MARKET_API || MARKET_SITE}/api/public/market-index`;

export interface MarketUnit {
  /** Model name, e.g. "Civic". */
  label: string;
  /** Typical asking price before tax, rounded to the nearest $500 at the source. */
  price: number;
  /** Listings behind the figure. 0 when the source did not say. */
  listings: number;
}

export interface MarketIndex {
  /** Date of the snapshot as YYYY-MM-DD, or '' when the source did not say. */
  asOf: string;
  /** Dealer websites covered, as a floor ("1,650+"). 0 when unknown. */
  dealers: number;
  units: MarketUnit[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const positive = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

/**
 * Reads the index out of a response body from another site, keeping only rows that are fully
 * usable. Anything malformed is dropped, so a changed or broken feed shows as "unavailable"
 * instead of as wrong numbers.
 */
export function parseMarketIndex(body: unknown): MarketIndex {
  const source = isRecord(body) ? body : {};
  const rows = Array.isArray(source.units) ? source.units : [];
  const units = rows.flatMap((row): MarketUnit[] => {
    if (!isRecord(row) || typeof row.label !== 'string') return [];
    const label = row.label.trim();
    const price = positive(row.price);
    if (!label || price === 0) return [];
    return [{ label, price, listings: Math.round(positive(row.n)) }];
  });
  const asOf = typeof source.asOf === 'string' && /^\d{4}-\d{2}-\d{2}/.test(source.asOf) ? source.asOf.slice(0, 10) : '';
  return { asOf, dealers: Math.round(positive(source.dealers)), units };
}

/**
 * Splits the units around a pre-tax budget. Both sides start nearest the budget: the dearest
 * unit that fits leads `within`, and the smallest stretch leads `over`.
 */
export function splitByBudget(units: MarketUnit[], maxPrice: number) {
  const within = units.filter((unit) => unit.price <= maxPrice).sort((a, b) => b.price - a.price);
  const over = units.filter((unit) => unit.price > maxPrice).sort((a, b) => a.price - b.price);
  return { within, over };
}
