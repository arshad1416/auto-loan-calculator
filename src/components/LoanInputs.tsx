import { useEffect, useState } from 'react';
import type { CalculationInput, CalculationResult, VehicleCondition } from '../lib/calculator';
import { PROVINCES } from '../lib/calculator';

interface Props {
  inputs: CalculationInput;
  results: CalculationResult;
  reverseMode: boolean;
  targetBiWeeklyPayment: number;
  targetMonthlyPayment: number;
  onChange: (field: keyof CalculationInput, value: number | string) => void;
  onCommitDownPayment: () => void;
  downPaymentRaised: boolean;
  onYearChange: (year: number) => void;
  onToggleMode: () => void;
  onTargetBiWeeklyChange: (value: number) => void;
  onTargetMonthlyChange: (value: number) => void;
  onReset: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 1990 + 2 }, (_, i) => 1990 + i).reverse();

// Snap points for the term slider: standard 12-month steps plus the
// mid-tier terms (42/54/66/78). Filtered by the year's max allowed term.
const TERM_STOPS = [12, 24, 36, 42, 48, 54, 60, 66, 72, 78, 84, 96];

const termYearsLabel = (m: number) => (m % 12 === 0 ? `${m / 12} yr` : `${(m / 12).toFixed(1)} yr`);

function nearestStopIndex(term: number, stops: number[]): number {
  let best = 0;
  for (let i = 1; i < stops.length; i++) {
    if (Math.abs(stops[i] - term) < Math.abs(stops[best] - term)) best = i;
  }
  return best;
}

const fmt = (n: number) => n.toLocaleString();

const parseFormatted = (raw: string): number => Math.min(parseFloat(raw.replace(/,/g, '')) || 0, 99_999_999);

/**
 * Money input that lets users type cents: the raw string is kept while
 * typing so a trailing "199." or "199.50" survives the controlled-input
 * round-trip (plain parse-and-reformat would eat the decimal point).
 * Accepts digits, thousands commas, and up to two decimals.
 */
const MoneyInput: React.FC<{ name: string; value: number; onChange: (value: number) => void }> = ({ name, value, onChange }) => {
  const [raw, setRaw] = useState<string>(value ? fmt(value) : '');

  // Re-sync when the value changes externally (reset, programmatic updates)
  useEffect(() => {
    if ((value || 0) !== parseFormatted(raw)) setRaw(value ? fmt(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!/^[\d,]*\.?\d{0,2}$/.test(v)) return; // digits, commas, one '.', max 2 decimals
    setRaw(v);
    onChange(parseFormatted(v));
  };

  return <input type="text" inputMode="decimal" name={name} value={raw} onChange={handleChange} />;
};

const LoanInputs: React.FC<Props> = ({
  inputs, results, reverseMode,
  targetBiWeeklyPayment, targetMonthlyPayment,
  onChange, onCommitDownPayment, downPaymentRaised, onYearChange, onToggleMode,
  onTargetBiWeeklyChange, onTargetMonthlyChange,
  onReset,
}) => {
  const isTermTooLong = inputs.termMonths > results.maxTermAllowed;
  const isDownPaymentTooLow = inputs.downPayment < results.minDownPaymentRequired;
  // Red while the entry is short, and still red just after we raised it, so the change is noticed.
  const flagDownPayment = isDownPaymentTooLow || downPaymentRaised;

  // Desjardins sheet: "Minimum term applicable of 24 months on any financing"
  const minTermMonths = results.desjardinsMaxTerm > 0 ? 24 : 12;
  const termStops = TERM_STOPS.filter((t) => t >= minTermMonths && t <= results.maxTermAllowed);
  const termIndex = termStops.includes(inputs.termMonths)
    ? termStops.indexOf(inputs.termMonths)
    : nearestStopIndex(inputs.termMonths, termStops);

  // minApr is advisory (real lender rates are set by credit tier, not model
  // year): the input shows a guideline warning instead of overriding the value.
  // Reserve-based rate availability is computed on results for internal use
  // only — it is deliberately not surfaced in this UI.
  const belowMarket = inputs.apr < results.minApr && inputs.apr > 0;

  const interestRateField = (
    <div className="input-group">
      <label>Interest Rate (%)</label>
      <input
        type="number"
        name="apr"
        value={inputs.apr}
        onChange={(e) => onChange('apr', parseFloat(e.target.value) || 0)}
        step="0.01"
        style={{ borderColor: belowMarket ? '#f59e0b' : '' }}
      />
      <div style={{
        color: belowMarket ? '#fbbf24' : 'var(--text-secondary)',
        fontSize: '0.7rem',
        marginTop: '0.2rem',
        fontWeight: belowMarket ? 600 : 400,
      }}>
        {belowMarket
          ? `⚠ Below CARF guideline rate — guideline min for ${inputs.vehicleYear}: ${results.minApr}%`
          : `CARF guideline min for ${inputs.vehicleYear}: ${results.minApr}%`}
      </div>
    </div>
  );

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
            {/* Interest Rate (editable) */}
            {interestRateField}

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
              <label>Loan Term: {inputs.termMonths} mo ({termYearsLabel(inputs.termMonths)})</label>
              <input
                type="range"
                name="termMonths"
                min={0}
                max={termStops.length - 1}
                step={1}
                value={termIndex}
                onChange={(e) => onChange('termMonths', termStops[parseInt(e.target.value)] ?? 12)}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span>{termStops[0]} mo</span>
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

            {/* Interest Rate */}
            {interestRateField}
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
            onBlur={onCommitDownPayment}
            style={{ borderColor: flagDownPayment ? 'var(--error-color)' : '' }}
          />
          {results.minDownPaymentRequired > 0 && (
            <div style={{
              color: flagDownPayment ? 'var(--error-color)' : 'var(--text-secondary)',
              fontSize: '0.7rem',
              marginTop: '0.2rem',
              fontWeight: flagDownPayment ? 600 : 400,
            }}>
              {downPaymentRaised
                ? `Raised to the minimum for ${inputs.vehicleYear}: $${results.minDownPaymentRequired.toLocaleString()}`
                : `Min Down Required: $${results.minDownPaymentRequired.toLocaleString()}`}
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
            <label>Loan Term: {inputs.termMonths} mo ({termYearsLabel(inputs.termMonths)})</label>
            <input
              type="range"
              name="termMonths"
              min={0}
              max={termStops.length - 1}
              step={1}
              value={termIndex}
              onChange={(e) => onChange('termMonths', termStops[parseInt(e.target.value)] ?? 12)}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <span>{termStops[0]} mo</span>
              <span style={{ color: isTermTooLong ? 'var(--error-color)' : '' }}>{results.maxTermAllowed} mo ({termYearsLabel(results.maxTermAllowed)})</span>
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
        <label style={{ marginBottom: '0.35rem', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600 }}>
          Additional Fees & Products (taxable except PPSA & insurance)
        </label>
        <div style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
          Insurance premiums are CRA-exempt — only Quebec taxes them (9% QST).
        </div>
        <div className="input-grid">
          <div className="input-group">
            <label>Lender Admin Fee ($)</label>
            <input
              type="text"
              inputMode="numeric"
              value={inputs.lenderAdminFee ? fmt(inputs.lenderAdminFee) : ''}
              onChange={(e) => onChange('lenderAdminFee', parseFormatted(e.target.value))}
            />
          </div>
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
            <label>PPSA Fee ($)</label>
            <input
              type="text"
              inputMode="numeric"
              value={inputs.ppsaFee !== undefined ? fmt(inputs.ppsaFee) : ''}
              onChange={(e) => onChange('ppsaFee', parseFormatted(e.target.value))}
            />
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Approximate — varies by lender ($32–$99). Financed, not taxed.
            </div>
          </div>
          <div className="input-group">
            <label>Warranty ($)</label>
            <MoneyInput name="warranty" value={inputs.warranty ?? 0} onChange={(v) => onChange('warranty', v)} />
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
            <MoneyInput name="otherFees" value={inputs.otherFees ?? 0} onChange={(v) => onChange('otherFees', v)} />
          </div>
          <div className="input-group">
            <label>Insurance (GAP / Life / A&H) ($)</label>
            <MoneyInput name="insuranceProducts" value={inputs.insuranceProducts ?? 0} onChange={(v) => onChange('insuranceProducts', v)} />
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginTop: '0.2rem' }}>
              {(inputs.provinceCode || 'ON') === 'QC'
                ? '9% QST applies to insurance premiums in Quebec'
                : `Tax-exempt insurance premium in ${PROVINCES.find((p) => p.code === (inputs.provinceCode || 'ON'))?.name ?? 'this province'} — financed, not taxed`}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="reset-btn"
          onClick={onReset}
          title="Reset all fields to defaults"
        >
          Reset All Fields
        </button>
      </div>
    </div>
  );
};

export default LoanInputs;
