import type { CalculationInput, CalculationResult } from '../lib/calculator';

interface Props {
  inputs: CalculationInput;
  results: CalculationResult;
  reverseMode: boolean;
  targetBiWeeklyPayment: number;
  targetMonthlyPayment: number;
  onChange: (field: keyof CalculationInput, value: number) => void;
  onYearChange: (year: number) => void;
  onToggleMode: () => void;
  onTargetBiWeeklyChange: (value: number) => void;
  onTargetMonthlyChange: (value: number) => void;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 1990 + 2 }, (_, i) => 1990 + i).reverse();

const fmt = (n: number) => n.toLocaleString();

const parseFormatted = (raw: string): number => parseFloat(raw.replace(/,/g, '')) || 0;

const LoanInputs: React.FC<Props> = ({
  inputs, results, reverseMode,
  targetBiWeeklyPayment, targetMonthlyPayment,
  onChange, onYearChange, onToggleMode,
  onTargetBiWeeklyChange, onTargetMonthlyChange,
}) => {
  const isTermTooLong = inputs.termMonths > results.maxTermAllowed;
  const isDownPaymentTooLow = inputs.downPayment < results.minDownPaymentRequired;

  return (
    <div className="glass-panel">
      {/* Mode Toggle */}
      <div className="mode-toggle">
        <button
          className={!reverseMode ? 'active' : ''}
          onClick={() => reverseMode && onToggleMode()}
        >
          Payment
        </button>
        <button
          className={reverseMode ? 'active' : ''}
          onClick={() => !reverseMode && onToggleMode()}
        >
          Max Price
        </button>
      </div>

      <div className="input-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Vehicle Year */}
        <div className="input-group" style={{ gridColumn: 'span 2' }}>
          <label>Vehicle Year</label>
          <select
            value={inputs.vehicleYear}
            onChange={(e) => onYearChange(parseInt(e.target.value))}
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {reverseMode ? (
          <>
            {/* Target Bi-Weekly Payment */}
            <div className="input-group">
              <label>Target Bi-Weekly ($)</label>
              <input
                type="number"
                value={targetBiWeeklyPayment || ''}
                onChange={(e) => onTargetBiWeeklyChange(parseFloat(e.target.value) || 0)}
              />
            </div>

            {/* Target Monthly Payment */}
            <div className="input-group">
              <label>Target Monthly ($)</label>
              <input
                type="number"
                value={targetMonthlyPayment || ''}
                onChange={(e) => onTargetMonthlyChange(parseFloat(e.target.value) || 0)}
              />
            </div>

            {/* APR (read-only) */}
            <div className="input-group">
              <label>APR (%)</label>
              <input
                type="number"
                value={results.minApr}
                readOnly
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              />
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginTop: '0.2rem' }}>
                Auto from {inputs.vehicleYear} rules
              </div>
            </div>

            {/* Term (read-only) */}
            <div className="input-group">
              <label>Term</label>
              <div style={{
                padding: '0.75rem 1rem',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--panel-border)',
                borderRadius: '0.75rem',
                fontSize: '1.125rem',
              }}>
                {results.maxTermAllowed} mo ({Math.round(results.maxTermAllowed / 12)} yr)
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginTop: '0.2rem' }}>
                Auto from {inputs.vehicleYear} rules
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Vehicle Price */}
            <div className="input-group">
              <label>Vehicle Price ($)</label>
              <input
                type="text"
                inputMode="numeric"
                className="formatted-input"
                name="vehiclePrice"
                value={inputs.vehiclePrice ? fmt(inputs.vehiclePrice) : ''}
                onChange={(e) => onChange('vehiclePrice', parseFormatted(e.target.value))}
              />
            </div>

            {/* APR */}
            <div className="input-group">
              <label>APR (%)</label>
              <input
                type="number"
                name="apr"
                value={inputs.apr}
                onChange={(e) => onChange('apr', parseFloat(e.target.value) || 0)}
                step="0.01"
              />
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginTop: '0.2rem' }}>
                Min for {inputs.vehicleYear}: {results.minApr}%
              </div>
            </div>
          </>
        )}

        {/* Trade-In Value */}
        <div className="input-group">
          <label>Trade-In Value ($)</label>
          <input
            type="number"
            name="tradeInValue"
            value={inputs.tradeInValue}
            onChange={(e) => onChange('tradeInValue', parseFloat(e.target.value) || 0)}
          />
        </div>

        {/* Down Payment */}
        <div className="input-group">
          <label>Down Payment ($)</label>
          <input
            type="text"
            inputMode="numeric"
            className="formatted-input"
            name="downPayment"
            value={inputs.downPayment ? fmt(inputs.downPayment) : ''}
            onChange={(e) => onChange('downPayment', parseFormatted(e.target.value))}
            style={{ borderColor: isDownPaymentTooLow ? 'var(--error-color)' : '' }}
          />
          {results.minDownPaymentRequired > 0 && (
            <div style={{
              color: isDownPaymentTooLow ? 'var(--error-color)' : 'var(--text-secondary)',
              fontSize: '0.7rem',
              marginTop: '0.2rem',
            }}>
              Min {Math.round(results.minDownPaymentRequired / (reverseMode ? results.maxVehiclePrice : inputs.vehiclePrice) * 100)}% Required: ${results.minDownPaymentRequired.toLocaleString()}
            </div>
          )}
        </div>

        {/* Licensing Fee */}
        <div className="input-group">
          <label>Licensing Fee ($)</label>
          <input
            type="number"
            name="licensingFee"
            value={inputs.licensingFee}
            onChange={(e) => onChange('licensingFee', parseFloat(e.target.value) || 0)}
          />
        </div>

        {/* Forward mode: Term slider */}
        {!reverseMode && (
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
        )}
      </div>
    </div>
  );
};

export default LoanInputs;
