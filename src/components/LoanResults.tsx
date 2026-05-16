import type { CalculationResult } from '../lib/calculator';

interface Props {
  results: CalculationResult;
}

const LoanResults: React.FC<Props> = ({ results }) => (
  <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
    <div className="hero-payment">
      <div className="payment-label">Bi-Weekly Payment</div>
      <div className="payment-amount">
        ${results.biWeeklyPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>

      <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--panel-border)' }}>
        <div className="payment-label" style={{ fontSize: '1rem' }}>Monthly Payment</div>
        <div className="payment-amount" style={{ fontSize: '2.5rem' }}>
          ${results.monthlyPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', padding: '0 1rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <label>HST (13%)</label>
        <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)' }}>
          ${results.hst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <label>Amount Financed</label>
        <div style={{ fontSize: '1.25rem', fontWeight: '700' }}>
          ${results.loanPrincipal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <label>Total Interest</label>
        <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--success-color)' }}>
          ${results.totalInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <label>Total Loan Cost</label>
        <div style={{ fontSize: '1.25rem', fontWeight: '700' }}>
          ${results.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      </div>
    </div>

    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', opacity: 0.7 }}>
      Includes $56 Licensing, $22 OMVIC, $2,000 Admin
    </div>
  </div>
);

export default LoanResults;
