import type { AmortizationPeriod } from '../lib/calculator';

interface Props {
  schedule: AmortizationPeriod[];
  visible: boolean;
  onToggle: () => void;
}

const AmortizationSchedule: React.FC<Props> = ({ schedule, visible, onToggle }) => (
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
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--panel-border)', color: 'var(--text-secondary)' }}>
              <th style={{ padding: '1rem' }}>#</th>
              <th style={{ padding: '1rem' }}>Payment</th>
              <th style={{ padding: '1rem' }}>Principal</th>
              <th style={{ padding: '1rem' }}>Interest</th>
              <th style={{ padding: '1rem' }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((row) => (
              <tr key={row.period} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{row.period}</td>
                <td style={{ padding: '1rem' }}>${row.payment.toFixed(2)}</td>
                <td style={{ padding: '1rem' }}>${row.principal.toFixed(2)}</td>
                <td style={{ padding: '1rem', color: 'var(--error-color)' }}>${row.interest.toFixed(2)}</td>
                <td style={{ padding: '1rem', fontWeight: '600', color: 'var(--accent-color)' }}>${row.balance.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </>
);

export default AmortizationSchedule;
