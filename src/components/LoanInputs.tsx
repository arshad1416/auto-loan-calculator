import type { CalculationInput, CalculationResult, VehicleCondition } from '../lib/calculator';
import { PROVINCES } from '../lib/calculator';

interface Props {
  inputs: CalculationInput;
  results: CalculationResult;
  reverseMode: boolean;
  targetBiWeeklyPayment: number;
  targetMonthlyPayment: number;
  onChange: (field: keyof CalculationInput, value: number | string) => void;
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
          Forward (Enter Price)
        </button>
        <button
          className={reverseMode ? 'active' : ''}
          onClick={() => !reverseMode && onToggleMode()}
        >
          Reverse (Enter Budget)
        </button>
      </div>

      <div className="input-grid">
        {/* Province / Territory */}
        <div className="input-group">
          <label>Province / Territory</label>
          <select
            value={inputs.provinceCode || 'ON'}
            onChange={(e) => onChange('provinceCode', e.target.value)}
          >
            {PROVINCES.map((p) => (
              <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
            ))}
          </select>
        </div>

        {/* Vehicle Year */}
        <div className="input-group">
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

        {/* Vehicle Condition */}
        <div className="input-group">
          <label>Vehicle Condition</label>
          <select
            value={inputs.vehicleCondition || 'used'}
            onChange={(e) => onChange('vehicleCondition', e.target.value as VehicleCondition)}
          >
            <option value="used">Used Vehicle</option>
            <option value="new">New Vehicle</option>
          </select>
        </div>

        {reverseMode ? (
          <>
            {/* APR (read-only) — sits above target payment row */}
            <div className="input-group">
              <label>APR (%)</label>
              <input
                type="number"
                value={results.minApr}
                readOnly
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              />
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginTop: '0.2rem' }}>
                Min for {inputs.vehicleYear}: {results.minApr}%
              </div>
            </div>

            {/* Target Bi-Weekly Payment */}
            <div className="input-group">
              <label>Target Bi-Weekly ($)</label>
              <input
                type="text"
                inputMode="numeric"
                value={targetBiWeeklyPayment ? fmt(targetBiWeeklyPayment) : ''}
                onChange={(e) => onTargetBiWeeklyChange(parseFormatted(e.target.value))}
              />
            </div>

            {/* Target Monthly Payment */}
            <div className="input-group">
              <label>Target Monthly ($)</label>
              <input
                type="text"
                inputMode="numeric"
                value={targetMonthlyPayment ? fmt(targetMonthlyPayment) : ''}
                onChange={(e) => onTargetMonthlyChange(parseFormatted(e.target.value))}
              />
            </div>

            {/* Term (editable slider) */}
            <div className="input-group">
              <label>Loan Term: {inputs.termMonths} mo ({Math.round(inputs.termMonths / 12)} yr)</label>
              <input
                type="range"
                name="termMonths"
                min={12}
                max={results.maxTermAllowed}
                step={12}
                value={inputs.termMonths}
                onChange={(e) => onChange('termMonths', parseInt(e.target.value) || 12)}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span>12 mo</span>
                <span>{results.maxTermAllowed} mo (max)</span>
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
                style={{ borderColor: inputs.apr < results.minApr && inputs.apr > 0 ? '#f59e0b' : '' }}
              />
              <div style={{
                color: inputs.apr < results.minApr && inputs.apr > 0 ? '#fbbf24' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                marginTop: '0.2rem',
                fontWeight: inputs.apr < results.minApr && inputs.apr > 0 ? 600 : 400,
              }}>
                {inputs.apr < results.minApr && inputs.apr > 0
                  ? `⚠ Below market rate — min for ${inputs.vehicleYear}: ${results.minApr}%`
                  : `Min for ${inputs.vehicleYear}: ${results.minApr}%`
                }
              </div>
            </div>
          </>
        )}

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
              Min Down Required: ${results.minDownPaymentRequired.toLocaleString()}
            </div>
          )}
        </div>

        {/* Trade-In Value */}
        <div className="input-group">
          <label>Trade-In Value ($)</label>
          <input
            type="text"
            inputMode="numeric"
            name="tradeInValue"
            value={inputs.tradeInValue ? fmt(inputs.tradeInValue) : ''}
            onChange={(e) => onChange('tradeInValue', parseFormatted(e.target.value))}
          />
        </div>

        {/* Lien on Trade-In */}
        <div className="input-group">
          <label>Lien on Trade-In ($)</label>
          <input
            type="text"
            inputMode="numeric"
            name="lienAmount"
            value={inputs.lienAmount ? fmt(inputs.lienAmount) : ''}
            onChange={(e) => onChange('lienAmount', parseFormatted(e.target.value))}
          />
        </div>

        {/* Licensing Fee */}
        <div className="input-group">
          <label>Licensing Fee ($)</label>
          <input
            type="text"
            inputMode="numeric"
            name="licensingFee"
            value={inputs.licensingFee ? fmt(inputs.licensingFee) : ''}
            onChange={(e) => onChange('licensingFee', parseFormatted(e.target.value))}
          />
        </div>

        {/* Forward mode: Term slider */}
        {!reverseMode && (
          <div className="input-group">
            <label>Loan Term: {inputs.termMonths} mo ({Math.round(inputs.termMonths / 12)} yr)</label>
            <input
              type="range"
              name="termMonths"
              min={12}
              max={84}
              step={12}
              value={inputs.termMonths}
              onChange={(e) => onChange('termMonths', parseInt(e.target.value) || 12)}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <span>12 mo</span>
              <span style={{ color: isTermTooLong ? 'var(--error-color)' : '' }}>84 mo (7 yr)</span>
            </div>
            {isTermTooLong && (
              <div style={{ color: 'var(--error-color)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                Max term for {inputs.vehicleYear} is {results.maxTermAllowed} months.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Additional Fees & Products */}
      <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--panel-border)' }}>
        <label style={{ marginBottom: '1rem', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600 }}>
          Additional Fees & Products (all taxable)
        </label>
        <div className="input-grid">
          <div className="input-group">
            <label>Dealer Admin Fee ($)</label>
            <input
              type="text"
              inputMode="numeric"
              value={inputs.dealerAdminFee ? fmt(inputs.dealerAdminFee) : ''}
              onChange={(e) => onChange('dealerAdminFee', parseFormatted(e.target.value))}
            />
          </div>
          <div className="input-group">
            <label>Warranty ($)</label>
            <input
              type="text"
              inputMode="numeric"
              value={inputs.warranty ? fmt(inputs.warranty) : ''}
              onChange={(e) => onChange('warranty', parseFormatted(e.target.value))}
            />
          </div>
          <div className="input-group">
            <label>Safety Certification ($)</label>
            <input
              type="text"
              inputMode="numeric"
              value={inputs.safetyCertification ? fmt(inputs.safetyCertification) : ''}
              onChange={(e) => onChange('safetyCertification', parseFormatted(e.target.value))}
            />
          </div>
          <div className="input-group">
            <label>Other Fees / Products ($)</label>
            <input
              type="text"
              inputMode="numeric"
              value={inputs.otherFees ? fmt(inputs.otherFees) : ''}
              onChange={(e) => onChange('otherFees', parseFormatted(e.target.value))}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoanInputs;
