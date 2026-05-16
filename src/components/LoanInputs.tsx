import type { CalculationInput, CalculationResult } from '../lib/calculator';

interface Props {
  inputs: CalculationInput;
  results: CalculationResult;
  onChange: (field: keyof CalculationInput, value: number) => void;
  onYearChange: (year: number) => void;
}

const LoanInputs: React.FC<Props> = ({ inputs, results, onChange, onYearChange }) => {
  const isAprTooLow = inputs.apr < results.minApr;
  const isTermTooLong = inputs.termMonths > results.maxTermAllowed;
  const isDownPaymentTooLow = inputs.downPayment < results.minDownPaymentRequired;

  return (
    <div className="glass-panel">
      <div className="input-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div className="input-group" style={{ gridColumn: 'span 2' }}>
          <label>Vehicle Year</label>
          <input
            type="number"
            name="vehicleYear"
            value={inputs.vehicleYear}
            onChange={(e) => onYearChange(parseFloat(e.target.value) || new Date().getFullYear())}
            min={2010}
            max={new Date().getFullYear() + 1}
          />
        </div>

        <div className="input-group">
          <label>Vehicle Price ($)</label>
          <input
            type="number"
            name="vehiclePrice"
            value={inputs.vehiclePrice}
            onChange={(e) => onChange('vehiclePrice', parseFloat(e.target.value) || 0)}
          />
        </div>

        <div className="input-group">
          <label>APR (%)</label>
          <input
            type="number"
            name="apr"
            value={inputs.apr}
            onChange={(e) => onChange('apr', parseFloat(e.target.value) || 0)}
            step="0.01"
            style={{ borderColor: isAprTooLow ? 'var(--error-color)' : '' }}
          />
          {isAprTooLow && (
            <div style={{ color: 'var(--error-color)', fontSize: '0.7rem', marginTop: '0.2rem' }}>
              Min for {inputs.vehicleYear}: {results.minApr}%
            </div>
          )}
        </div>

        <div className="input-group">
          <label>Trade-In Value ($)</label>
          <input
            type="number"
            name="tradeInValue"
            value={inputs.tradeInValue}
            onChange={(e) => onChange('tradeInValue', parseFloat(e.target.value) || 0)}
          />
        </div>

        <div className="input-group">
          <label>Down Payment ($)</label>
          <input
            type="number"
            name="downPayment"
            value={inputs.downPayment}
            onChange={(e) => onChange('downPayment', parseFloat(e.target.value) || 0)}
            style={{ borderColor: isDownPaymentTooLow ? 'var(--error-color)' : '' }}
          />
          {isDownPaymentTooLow && (
            <div style={{ color: 'var(--error-color)', fontSize: '0.7rem', marginTop: '0.2rem' }}>
              Min 10% Required: ${results.minDownPaymentRequired.toLocaleString()}
            </div>
          )}
        </div>

        <div className="input-group" style={{ gridColumn: 'span 2' }}>
          <label>Loan Term: {inputs.termMonths} Months ({Math.round(inputs.termMonths / 12)} Years)</label>
          <input
            type="range"
            name="termMonths"
            min={12}
            max={84}
            step={12}
            value={inputs.termMonths}
            onChange={(e) => onChange('termMonths', parseFloat(e.target.value) || 12)}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <span>12 mo</span>
            <span style={{ color: isTermTooLong ? 'var(--error-color)' : '' }}>84 mo (7 yr max)</span>
          </div>
          {isTermTooLong && (
            <div style={{ color: 'var(--error-color)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
              Max term for {inputs.vehicleYear} is {results.maxTermAllowed} months.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoanInputs;
