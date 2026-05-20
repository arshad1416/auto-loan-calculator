import type { CalculationInput, CalculationResult } from '../lib/calculator';
import { PROVINCES } from '../lib/calculator';

interface Props {
  inputs: CalculationInput;
  results: CalculationResult;
  reverseMode: boolean;
  targetBiWeeklyPayment: number;
  targetMonthlyPayment: number;
}

const fmt = (n: number, decimals = 2) =>
  n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const LoanResults: React.FC<Props> = ({ inputs, results, reverseMode, targetBiWeeklyPayment, targetMonthlyPayment }) => {
  const selectedProv = PROVINCES.find(p => p.code === (inputs.provinceCode || 'ON')) || PROVINCES[0];

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="hero-payment">
        {reverseMode ? (
          <>
            <div className="payment-label">Max Vehicle Price (Pre-Tax)</div>
            <div className="payment-amount" style={{ fontSize: '3.5rem' }}>
              ${results.maxVehiclePrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--panel-border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <div className="payment-label" style={{ fontSize: '0.75rem' }}>Bi-Weekly Budget</div>
                <div className="payment-amount" style={{ fontSize: '1.5rem' }}>
                  ${targetBiWeeklyPayment.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="payment-label" style={{ fontSize: '0.75rem' }}>Monthly Budget</div>
                <div className="payment-amount" style={{ fontSize: '1.5rem' }}>
                  ${targetMonthlyPayment.toLocaleString()}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="payment-label">Bi-Weekly Payment</div>
            <div className="payment-amount">
              ${fmt(results.biWeeklyPayment)}
            </div>

            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--panel-border)' }}>
              <div className="payment-label" style={{ fontSize: '1rem' }}>Monthly Payment</div>
              <div className="payment-amount" style={{ fontSize: '2.5rem' }}>
                ${fmt(results.monthlyPayment)}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Financial Metrics */}
      <div className="metrics-grid">
        {/* Row 1: Loan Term + Condition */}
        <div className="metrics-row">
          <div className="metric">
            <label>Loan Term</label>
            <div className="metric-value">
              {inputs.termMonths} mo <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>({Math.round(inputs.termMonths / 12)} yr)</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>@ {inputs.apr}% APR</div>
          </div>
          <div className="metric">
            <label>Condition</label>
            <div className="metric-value" style={{ textTransform: 'capitalize' }}>{inputs.vehicleCondition || 'used'}</div>
          </div>
        </div>

        {/* Row 2: Sales Tax + Amount Financed */}
        <div className="metrics-row">
          <div className="metric">
            <label>Sales Tax ({selectedProv.taxType})</label>
            <div className="metric-value">${fmt(results.hst)}</div>
            {selectedProv.taxType === 'GST+PST' && (
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                GST: ${fmt(results.gst || 0)} &nbsp; PST: ${fmt(results.pst || 0)}
              </div>
            )}
            {selectedProv.taxType === 'GST' && (
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                GST (5%): ${fmt(results.gst || 0)}
              </div>
            )}
            {results.luxuryTax !== undefined && results.luxuryTax > 0 && (
              <div style={{ fontSize: '0.7rem', color: '#fbbf24', marginTop: '0.25rem', fontWeight: 600 }}>
                ● Luxury Tax: ${fmt(results.luxuryTax)}
              </div>
            )}
          </div>
          <div className="metric">
            <label>Amount Financed</label>
            <div className="metric-value">${results.loanPrincipal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
        </div>

        {/* Row 3: Total Loan Cost + Total Interest */}
        <div className="metrics-row">
          <div className="metric">
            <label>Total Loan Cost</label>
            <div className="metric-value">${results.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div className="metric">
            <label>Total Interest</label>
            <div className="metric-value" style={{ color: 'var(--success-color)' }}>
              ${results.totalInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>
      </div>

      {(results.financedNegativeEquity > 0 || results.excessNegativeEquity > 0) && (
        <div style={{
          padding: '0.75rem 1rem',
          background: results.excessNegativeEquity > 0 ? 'rgba(234, 67, 53, 0.08)' : 'rgba(52, 168, 83, 0.06)',
          borderRadius: '8px',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          lineHeight: '1.5',
        }}>
          <div style={{ fontWeight: '600', color: results.excessNegativeEquity > 0 ? 'var(--error-color)' : 'var(--text-primary)', marginBottom: '0.25rem' }}>
            Negative Equity (Lien − Trade-In)
          </div>
          ${results.financedNegativeEquity.toLocaleString()} rolled into financing
          {results.excessNegativeEquity > 0 && (
            <div style={{ color: 'var(--error-color)', marginTop: '0.25rem' }}>
              ${results.excessNegativeEquity.toLocaleString()} exceeds 40% cap — added to minimum down payment
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', opacity: 0.7 }}>
        Includes ${results.licensingFee.toLocaleString()} Licensing
        {selectedProv.regulatingFee > 0 && `, $${selectedProv.regulatingFee} ${selectedProv.regulatingFeeName}`}
        {results.lenderAdminFee > 0 && `, $${results.lenderAdminFee.toLocaleString()} Lender Admin`}
        {results.dealerAdminFee > 0 && `, $${results.dealerAdminFee.toLocaleString()} Dealer Admin`}
        {results.warranty > 0 && `, $${results.warranty.toLocaleString()} Warranty`}
        {results.safetyCertification > 0 && `, $${results.safetyCertification.toLocaleString()} Safety Cert`}
        {results.otherFees > 0 && `, $${results.otherFees.toLocaleString()} Other Fees`}
        .
      </div>
    </div>
  );
};

export default LoanResults;
