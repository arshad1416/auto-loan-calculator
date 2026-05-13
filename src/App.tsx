import React, { useState, useEffect } from 'react';
import { calculateAutoLoan } from './lib/calculator';
import type { CalculationInput, CalculationResult } from './lib/calculator';

const App: React.FC = () => {
  const [inputs, setInputs] = useState<CalculationInput>({
    vehicleYear: new Date().getFullYear(),
    vehiclePrice: 45000,
    tradeInValue: 0,
    downPayment: 5000,
    apr: 6.99,
    termMonths: 84,
  });

  const [results, setResults] = useState<CalculationResult | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);

  // Core calculation effect
  useEffect(() => {
    setResults(calculateAutoLoan(inputs));
  }, [inputs]);

  // Automatic adjustments based on year category
  useEffect(() => {
    const updatedResults = calculateAutoLoan(inputs);
    
    setInputs(prev => ({
      ...prev,
      apr: updatedResults.minApr,
      termMonths: updatedResults.maxTermAllowed,
      downPayment: Math.max(prev.downPayment, updatedResults.minDownPaymentRequired)
    }));
  }, [inputs.vehicleYear]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setInputs(prev => ({
      ...prev,
      [name]: parseFloat(value) || 0
    }));
  };

  if (!results) return null;

  const isAprTooLow = inputs.apr < results.minApr;
  const isTermTooLong = inputs.termMonths > results.maxTermAllowed;
  const isDownPaymentTooLow = inputs.downPayment < results.minDownPaymentRequired;

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '5rem' }}>
      <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1>SHIFT<span style={{ color: 'var(--accent-color)' }}>LOGIC</span> HQ</h1>
        <p className="subtitle">Official Dealer Payment Calculator</p>
      </header>

      <div className="app-grid">
        {/* Input Section */}
        <div className="glass-panel">
          <div className="input-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="input-group" style={{ gridColumn: 'span 2' }}>
              <label>Vehicle Year</label>
              <input 
                type="number" 
                name="vehicleYear" 
                value={inputs.vehicleYear} 
                onChange={handleInputChange}
                min={2010}
                max={2027}
              />
            </div>

            <div className="input-group">
              <label>Vehicle Price ($)</label>
              <input 
                type="number" 
                name="vehiclePrice" 
                value={inputs.vehiclePrice} 
                onChange={handleInputChange} 
              />
            </div>

            <div className="input-group">
              <label>APR (%)</label>
              <input 
                type="number" 
                name="apr" 
                value={inputs.apr} 
                onChange={handleInputChange}
                step="0.01"
                style={{ borderColor: isAprTooLow ? 'var(--error-color)' : '' }}
              />
              {isAprTooLow && <div style={{ color: 'var(--error-color)', fontSize: '0.7rem', marginTop: '0.2rem' }}>Min for {inputs.vehicleYear}: {results.minApr}%</div>}
            </div>

            <div className="input-group">
              <label>Trade-In Value ($)</label>
              <input 
                type="number" 
                name="tradeInValue" 
                value={inputs.tradeInValue} 
                onChange={handleInputChange} 
              />
            </div>

            <div className="input-group">
              <label>Down Payment ($)</label>
              <input 
                type="number" 
                name="downPayment" 
                value={inputs.downPayment} 
                onChange={handleInputChange} 
                style={{ borderColor: isDownPaymentTooLow ? 'var(--error-color)' : '' }}
              />
              {isDownPaymentTooLow && <div style={{ color: 'var(--error-color)', fontSize: '0.7rem', marginTop: '0.2rem' }}>Min 10% Required: ${results.minDownPaymentRequired.toLocaleString()}</div>}
            </div>

            <div className="input-group" style={{ gridColumn: 'span 2' }}>
              <label>Loan Term: {inputs.termMonths} Months ({Math.round(inputs.termMonths/12)} Years)</label>
              <input 
                type="range" 
                name="termMonths" 
                min={12} 
                max={84} 
                step={12}
                value={inputs.termMonths} 
                onChange={handleInputChange} 
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span>12 mo</span>
                <span style={{ color: isTermTooLong ? 'var(--error-color)' : '' }}>84 mo (7 yr max)</span>
              </div>
              {isTermTooLong && <div style={{ color: 'var(--error-color)', fontSize: '0.75rem', marginTop: '0.5rem' }}>Max term for {inputs.vehicleYear} is {results.maxTermAllowed} months.</div>}
            </div>
          </div>
        </div>

        {/* Results Section */}
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
      </div>

      <div style={{ marginTop: '3rem', textAlign: 'center' }}>
        <button 
          onClick={() => setShowSchedule(!showSchedule)}
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
            boxShadow: showSchedule ? '0 0 20px var(--accent-glow)' : 'none'
          }}
        >
          {showSchedule ? 'Hide Amortization Schedule' : 'View Amortization Schedule'}
        </button>
      </div>

      {showSchedule && (
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
              {results.schedule.map((row) => (
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

      <footer style={{ marginTop: '4rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
        &copy; {new Date().getFullYear()} ShiftLogic HQ Automation Hub. All calculations are estimates.
      </footer>
    </div>
  );
};

export default App;
