import { useState, useMemo } from 'react';
import type { AmortizationPeriod } from '../lib/calculator';
import { computeLumpSumAmortization } from '../lib/calculator';

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
  const [extraPayments, setExtraPayments] = useState<Record<number, number>>({});

  const hasAnyExtra = Object.values(extraPayments).some(v => v > 0);

  const lumpSum = useMemo(() => {
    if (!hasAnyExtra) return null;
    return computeLumpSumAmortization(loanPrincipal, apr, termMonths, biWeeklyPayment, extraPayments);
  }, [loanPrincipal, apr, termMonths, biWeeklyPayment, extraPayments, hasAnyExtra]);

  const displaySchedule = lumpSum ? lumpSum.schedule : schedule;

  const handleExtraChange = (period: number, value: number) => {
    setExtraPayments(prev => {
      const next = { ...prev };
      if (value > 0) {
        next[period] = value;
      } else {
        delete next[period];
      }
      return next;
    });
  };

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
          {lumpSum && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem',
              padding: '1rem', background: 'rgba(16,185,129,0.06)', borderRadius: '0.75rem',
              border: '1px solid rgba(16,185,129,0.2)',
            }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--success-color)', fontWeight: 600 }}>
                {lumpSum.periodsSaved} periods saved &middot; ${lumpSum.interestSaved.toLocaleString(undefined, { maximumFractionDigits: 0 })} interest saved
              </div>
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--panel-border)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '1rem' }}>#</th>
                <th style={{ padding: '1rem' }}>Payment</th>
                <th style={{ padding: '1rem' }}>Principal</th>
                <th style={{ padding: '1rem' }}>Interest</th>
                <th style={{ padding: '1rem', color: 'var(--success-color)' }}>Extra</th>
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
                  <td style={{ padding: '0.5rem 1rem' }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={extraPayments[row.period] ? extraPayments[row.period].toLocaleString() : ''}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value.replace(/,/g, '')) || 0;
                        handleExtraChange(row.period, v);
                      }}
                      placeholder="0"
                      style={{
                        width: '80px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--panel-border)',
                        borderRadius: '0.4rem',
                        padding: '0.4rem 0.5rem',
                        color: extraPayments[row.period] ? 'var(--success-color)' : 'var(--text-primary)',
                        fontFamily: 'var(--font-main)',
                        fontSize: '0.8rem',
                        textAlign: 'right',
                      }}
                    />
                  </td>
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
