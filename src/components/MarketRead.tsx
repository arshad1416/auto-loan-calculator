import { useEffect, useRef, useState } from 'react';
import { MARKET_INDEX_API, MARKET_INDEX_PAGE, parseMarketIndex, splitByBudget, type MarketIndex, type MarketUnit } from '../lib/market';
import { tidy } from '../lib/money';

interface Props {
  /** The most the vehicle can cost before tax. */
  maxPrice: number;
  provinceCode: string;
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; index: MarketIndex }
  | { status: 'unavailable' };

const TIMEOUT_MS = 12000;

const SourceLink: React.FC = () => (
  <a href={MARKET_INDEX_PAGE} target="_blank" rel="noopener">
    Ontario market index on CompCeiling
  </a>
);

/** What the buyer's maximum price buys, set against typical Ontario asking prices. */
const MarketRead: React.FC<Props> = ({ maxPrice, provinceCode }) => {
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const load = async () => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let next: LoadState = { status: 'unavailable' };
    try {
      const response = await fetch(MARKET_INDEX_API, { signal: controller.signal });
      if (response.ok) {
        const index = parseMarketIndex(await response.json());
        if (index.units.length > 0) next = { status: 'loaded', index };
      }
    } catch {
      // Offline, timed out, blocked, or not JSON: all read as "unavailable".
    } finally {
      clearTimeout(timeout);
    }
    if (mountedRef.current) setState(next);
  };

  const row = (unit: MarketUnit, withinBudget: boolean) => (
    <li key={unit.label} className={`listing${withinBudget ? '' : ' listing--over'}`}>
      <span className="listing__body">
        <strong>{unit.label}</strong>
        <span>
          {withinBudget ? 'Within budget' : `Over by about $${Math.round(unit.price - maxPrice).toLocaleString()}`}
          {unit.listings > 0 && ` · ${unit.listings.toLocaleString()} listings tracked`}
        </span>
      </span>
      <span className="listing__price">≈ ${tidy(unit.price)}</span>
    </li>
  );

  return (
    <section className="listings" aria-label="What this budget buys">
      {state.status === 'idle' && (
        <div className="listings__prompt">
          <button type="button" className="btn-exit" onClick={load}>
            See what this budget buys
          </button>
          <p>Typical asking prices for Ontario's most-listed used vehicles, set against your maximum price.</p>
        </div>
      )}

      {state.status === 'loading' && (
        <div className="listings__prompt">
          <div className="spinner" role="status" aria-label="Loading the market index" />
          <p>Reading the Ontario market…</p>
        </div>
      )}

      {state.status === 'loaded' && (() => {
        const { index } = state;
        const { within, over } = splitByBudget(index.units, maxPrice);
        return (
          <>
            <header className="listings__head">
              <h3>
                {within.length} of {index.units.length} popular models fit ${tidy(maxPrice)}
              </h3>
              <span>Ontario{index.asOf && `, as of ${index.asOf}`}</span>
            </header>

            {provinceCode !== 'ON' && (
              <p className="notice">These are Ontario asking prices. Expect other provinces to differ.</p>
            )}

            <ul className="listings__list">
              {within.map((unit) => row(unit, true))}
              {over.map((unit) => row(unit, false))}
            </ul>

            <p className="listings__foot">
              Typical asking prices before tax and fees, rounded to the nearest $500
              {index.dealers > 0 && `, from ${index.dealers.toLocaleString()}+ Ontario dealer websites`}. Asking
              prices are not sold prices, and each figure spans every year and trim of that model. Source:{' '}
              <SourceLink />.
            </p>
          </>
        );
      })()}

      {state.status === 'unavailable' && (
        <div className="listings__prompt">
          <strong>The market snapshot is not available right now</strong>
          <p>
            You can read it directly at the <SourceLink />.
          </p>
          <button type="button" className="btn-line" onClick={load}>
            Try again
          </button>
        </div>
      )}
    </section>
  );
};

export default MarketRead;
