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
    <div className="glass-panel" style={{ marginTop: '2rem' }}>
      {state.status === 'idle' && (
        <div style={{ textAlign: 'center', padding: '1.5rem' }}>
          <button
            className="mode-toggle active"
            onClick={fetchListings}
            style={{ padding: '0.75rem 2rem', fontSize: '0.95rem', cursor: 'pointer' }}
          >
            Find Matching Vehicles
          </button>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
            Searches AutoTrader &amp; CarGurus for vehicles matching your budget
          </div>
        </div>
      )}

      {state.status === 'loading' && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div className="spinner" role="status" aria-label="Searching listings" />
          <div style={{ color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
            Searching AutoTrader &amp; CarGurus...
          </div>
        </div>
      )}

      {(state.status === 'loaded' || (state.status === 'error' && state.fallback)) && (() => {
          const raw = state.status === 'loaded' ? state.data.results : state.fallback!.results;
          const inBudget = raw.filter((v) => v.price <= maxPrice);

          return (
        <>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '0.75rem 0', marginBottom: '0.75rem',
            borderBottom: '1px solid var(--panel-border)',
          }}>
            <div style={{ fontWeight: 700 }}>
              {inBudget.length} Vehicles Within Budget
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {state.status === 'loaded'
                ? state.data.cached ? 'From cache' : 'Live results'
                : 'From cache'}
            </div>
          </div>

          {state.status === 'error' && (
            <div style={{
              padding: '0.5rem 0.75rem', marginBottom: '0.75rem',
              background: 'rgba(255, 133, 0, 0.08)', borderRadius: '8px',
              fontSize: '0.8rem', color: '#f59e0b',
            }}>
              {state.message}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
              <a
                key={v.url}
                href={safeUrl(v.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="listing-card"
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.75rem 1rem', border: '1px solid var(--panel-border)',
                  borderRadius: '10px', textDecoration: 'none', color: 'inherit',
                  transition: 'border-color 0.2s',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {v.year} {v.make} {v.model}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {fmtMileage(v.mileage)} · {v.dealership}, {v.city}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--accent-color)', marginTop: '0.25rem' }}>
                    Est. ${Math.round(payment.biWeeklyPayment).toLocaleString()}/bi-wk · ${Math.round(payment.monthlyPayment).toLocaleString()}/mo
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: 'var(--success-color)' }}>
                    ${v.price.toLocaleString()}
                  </div>
                </div>
              </a>
                );
              })}
          </div>

          {inBudget.length > 5 && !showAll && (
            <div style={{ textAlign: 'center', padding: '0.75rem' }}>
              <button
                className="mode-toggle"
                onClick={() => setShowAll(true)}
                style={{ padding: '0.5rem 2rem', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                Show all {inBudget.length} listings
              </button>
            </div>
          )}
        </>
          );
        })()}

      {state.status === 'empty' && (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No matching vehicles found</div>
          <div style={{ fontSize: '0.85rem' }}>
            Try expanding your year range or increasing your budget.
          </div>
          <button
            className="mode-toggle"
            onClick={() => setState({ status: 'idle' })}
            style={{ marginTop: '1rem', padding: '0.5rem 1.5rem', cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      )}

      {state.status === 'error' && !state.fallback && (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--error-color)' }}>
            {state.message}
          </div>
          <button
            className="mode-toggle"
            onClick={() => setState({ status: 'idle' })}
            style={{ marginTop: '1rem', padding: '0.5rem 1.5rem', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

export default VehicleListings;
