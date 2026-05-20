import { useState } from 'react';
import type { AmortizationPeriod } from '../lib/calculator';
import { computeAcceleratedAmortization } from '../lib/calculator';

interface Props {
  schedule: AmortizationPeriod[];
  visible: boolean;
  onToggle: () => void;
  loanPrincipal: number;
  apr: number;
  termMonths: number;
  biWeeklyPayment: number;
}

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const AmortizationSchedule: React.FC<Props> = ({
  schedule, visible, onToggle,
  loanPrincipal, apr, termMonths, biWeeklyPayment,
}) => {
  const [extraPayment, setExtraPayment] = useState(0);

  const accelerated = extraPayment > 0
    ? computeAcceleratedAmortization(loanPrincipal, apr, termMonths, biWeeklyPayment, extraPayment)
    : null;

  const displaySchedule = accelerated ? accelerated.schedule : schedule;
  const hasExtra = extraPayment > 0;

  return (
    <>
      <div style={{ marginTop: '3rem', textAlign: 'center' }}>
        <button
          onClick={onToggle}
          className="schedule-toggle"
          style={{
            background: 'transparent',
            border: '1px solid var(--accent-color)',
            color: 'var(--accent-color)',
            padding: '0.75rem 2rem',
            borderRadius: '2rem',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: '600',
            transition: 'all 0.3s ease',
            boxShadow: visible ? '0 0 20px var(--accent-glow)' : 'none',
          }}
        >
          {visible ? 'Hide Amortization Schedule' : 'View Amortization Schedule'}
        </button>
      </div>

      {visible && (
        <div className="glass-panel animate-fade-in" style={{ marginTop: '2rem', overflowX: 'auto' }}>
          {/* Extra Payment Input */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem',
            padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem',
            border: '1px solid var(--panel-border)',
          }}>
            <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', margin: 0 }}>
              Extra Payment per Period ($)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={extraPayment > 0 ? extraPayment.toLocaleString() : ''}
              onChange={(e) => {
                const v = parseFloat(e.target.value.replace(/,/g, '')) || 0;
                setExtraPayment(v);
              }}
              placeholder="0"
              style={{
                width: '140px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--panel-border)',
                borderRadius: '0.5rem',
                padding: '0.5rem 0.75rem',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-main)',
                fontSize: '0.875rem',
              }}
            />
            {accelerated && (
              <div style={{ fontSize: '0.75rem', color: 'var(--success-color)', fontWeight: 600 }}>
                {accelerated.periodsSaved} periods saved &middot; ${accelerated.interestSaved.toLocaleString(undefined, { maximumFractionDigits: 0 })} interest saved
              </div>
            )}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--panel-border)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '1rem' }}>#</th>
                <th style={{ padding: '1rem' }}>Payment</th>
                <th style={{ padding: '1rem' }}>Principal</th>
                <th style={{ padding: '1rem' }}>Interest</th>
                {hasExtra && <th style={{ padding: '1rem', color: 'var(--success-color)' }}>Extra</th>}
                <th style={{ padding: '1rem' }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {displaySchedule.map((row) => (
                <tr key={row.period} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{row.period}</td>
                  <td style={{ padding: '1rem' }}>${fmt(row.payment)}</td>
                  <td style={{ padding: '1rem' }}>${fmt(row.principal)}</td>
                  <td style={{ padding: '1rem', color: 'var(--error-color)' }}>${fmt(row.interest)}</td>
                  {hasExtra && (
                    <td style={{ padding: '1rem', color: 'var(--success-color)' }}>
                      ${fmt(row.extraPayment || 0)}
                    </td>
                  )}
                  <td style={{ padding: '1rem', fontWeight: '600', color: 'var(--accent-color)' }}>
                    ${fmt(row.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default AmortizationSchedule;
