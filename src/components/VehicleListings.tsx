import { useState, useRef, useEffect } from 'react';
import { calculateAutoLoan, getYearRules, type VehicleCondition } from '../lib/calculator';

interface Vehicle {
  year: number;
  make: string;
  model: string;
  price: number;
  mileage: number;
  condition: string;
  dealership: string;
  city: string;
  province: string;
  url: string;
  source: string;
}

interface ListingsResponse {
  cached: boolean;
  fallback: boolean;
  timestamp: string;
  count: number;
  results: Vehicle[];
}

interface Props {
  maxPrice: number;
  provinceCode: string;
  vehicleCondition: VehicleCondition;
  vehicleYear: number;
  downPayment: number;
  apr: number;
  termMonths: number;
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: ListingsResponse }
  | { status: 'empty' }
  | { status: 'error'; message: string; fallback?: ListingsResponse };

const API_BASE = import.meta.env.VITE_LISTINGS_API || '';

const safeUrl = (url: string): string => /^https?:\/\//i.test(url) ? url : '#';

const fmtMileage = (km: number) =>
  km ? `${km.toLocaleString()} km` : '—';

const VehicleListings: React.FC<Props> = ({ maxPrice, provinceCode, vehicleCondition, vehicleYear, downPayment, apr, termMonths }) => {
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [showAll, setShowAll] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const fetchListings = async () => {
    setState({ status: 'loading' });
    const minYear = Math.max(1990, vehicleYear - 5);
    const maxYear = vehicleYear + 5;
    const params = new URLSearchParams({
      maxPrice: String(maxPrice),
      province: provinceCode,
      condition: vehicleCondition || 'used',
      minYear: String(minYear),
      maxYear: String(maxYear),
    });

    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    timeoutRef.current = timeout;

    try {
      const resp = await fetch(`${API_BASE}/api/listings?${params}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!resp.ok) throw new Error(`Server responded ${resp.status}`);

      const data: ListingsResponse = await resp.json();

      if (data.count === 0) {
        setState({ status: 'empty' });
      } else if (data.fallback) {
        setState({ status: 'error', message: 'Live search unavailable — showing recent listings', fallback: data });
      } else {
        setState({ status: 'loaded', data });
      }
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof DOMException && err.name === 'AbortError') {
        setState({ status: 'error', message: 'Search timed out. Try again or expand your criteria.' });
      } else {
        setState({ status: 'error', message: 'Could not reach listing service. Try again later.' });
      }
    }
  };

  return (
    <section className="listings" aria-label="Vehicles within budget">
      {state.status === 'idle' && (
        <div className="listings__prompt">
          <button type="button" className="btn-exit" onClick={fetchListings}>
            Find vehicles in this budget
          </button>
          <p>Searches AutoTrader and CarGurus for vehicles at or under your max price.</p>
        </div>
      )}

      {state.status === 'loading' && (
        <div className="listings__prompt">
          <div className="spinner" role="status" aria-label="Searching listings" />
          <p>Searching AutoTrader and CarGurus…</p>
        </div>
      )}

      {(state.status === 'loaded' || (state.status === 'error' && state.fallback)) && (() => {
        const raw = state.status === 'loaded' ? state.data.results : state.fallback!.results;
        const inBudget = raw.filter((v) => v.price <= maxPrice);

        return (
          <>
            <header className="listings__head">
              <h3>{inBudget.length} vehicles within budget</h3>
              <span>
                {state.status === 'loaded' && !state.data.cached ? 'Live results' : 'From cache'}
              </span>
            </header>

            {state.status === 'error' && <p className="notice">{state.message}</p>}

            <ul className="listings__list">
              {inBudget
                .slice(0, showAll ? undefined : 5)
                .map((v) => {
                  const rules = getYearRules(v.year || vehicleYear);
                  const payment = calculateAutoLoan({
                    vehicleYear: v.year || vehicleYear,
                    vehiclePrice: v.price,
                    tradeInValue: 0,
                    lienAmount: 0,
                    downPayment,
                    apr,
                    termMonths: Math.min(termMonths, rules.maxTermAllowed),
                    licensingFee: 0,
                    provinceCode: provinceCode || 'ON',
                    vehicleCondition: (v.condition as VehicleCondition) || vehicleCondition || 'used',
                  });

                  return (
                    <li key={v.url}>
                      <a href={safeUrl(v.url)} target="_blank" rel="noopener noreferrer" className="listing">
                        <span className="listing__body">
                          <strong>{v.year} {v.make} {v.model}</strong>
                          <span>{fmtMileage(v.mileage)} · {v.dealership}, {v.city}</span>
                          <span className="listing__payment">
                            Est. ${Math.round(payment.biWeeklyPayment).toLocaleString()} bi-weekly · ${Math.round(payment.monthlyPayment).toLocaleString()} monthly
                          </span>
                        </span>
                        <span className="listing__price">${v.price.toLocaleString()}</span>
                      </a>
                    </li>
                  );
                })}
            </ul>

            {inBudget.length > 5 && !showAll && (
              <button type="button" className="btn-line" onClick={() => setShowAll(true)}>
                Show all {inBudget.length} listings
              </button>
            )}
          </>
        );
      })()}

      {state.status === 'empty' && (
        <div className="listings__prompt">
          <strong>No matching vehicles found</strong>
          <p>Try a wider year range or a higher budget.</p>
          <button type="button" className="btn-line" onClick={() => setState({ status: 'idle' })}>
            Try again
          </button>
        </div>
      )}

      {state.status === 'error' && !state.fallback && (
        <div className="listings__prompt">
          <strong className="listings__error">{state.message}</strong>
          <button type="button" className="btn-line" onClick={() => setState({ status: 'idle' })}>
            Retry
          </button>
        </div>
      )}
    </section>
  );
};

export default VehicleListings;
