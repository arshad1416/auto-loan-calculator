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

interface FieldProps {
  label: string;
  note?: string;
  tone?: 'warn' | 'error';
  className?: string;
  children: React.ReactNode;
}

/** A labelled control with an optional note beneath it. */
const Field: React.FC<FieldProps> = ({ label, note, tone, className, children }) => (
  <label className={['field', tone && `field--${tone}`, className].filter(Boolean).join(' ')}>
    <span className="field__label">{label}</span>
    {children}
    {note && <span className="field__note">{note}</span>}
  </label>
);

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
  // Flagged while the entry is short, and still flagged just after we raised it, so the change is noticed.
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

  const provinceCode = inputs.provinceCode || 'ON';
  const provinceName = PROVINCES.find((p) => p.code === provinceCode)?.name ?? 'this province';

  const interestRateField = (
    <Field
      label="Interest rate (%)"
      note={belowMarket
        ? `Below the going rate. Floor for ${inputs.vehicleYear}: ${results.minApr}%`
        : `Floor for ${inputs.vehicleYear}: ${results.minApr}%`}
      tone={belowMarket ? 'warn' : undefined}
    >
      <input
        type="number"
        name="apr"
        value={inputs.apr}
        onChange={(e) => onChange('apr', parseFloat(e.target.value) || 0)}
        step="0.01"
      />
    </Field>
  );

  const termField = (
    <Field
      className="field--wide"
      label={`Loan term: ${inputs.termMonths} months (${termYearsLabel(inputs.termMonths)})`}
      note={isTermTooLong ? `Longest term for a ${inputs.vehicleYear} is ${results.maxTermAllowed} months.` : undefined}
      tone={isTermTooLong ? 'error' : undefined}
    >
      <input
        type="range"
        name="termMonths"
        min={0}
        max={termStops.length - 1}
        step={1}
        value={termIndex}
        onChange={(e) => onChange('termMonths', termStops[parseInt(e.target.value)] ?? 12)}
      />
      <span className="range-ends">
        <span>{termStops[0]} mo</span>
        <span>{results.maxTermAllowed} mo max ({termYearsLabel(results.maxTermAllowed)})</span>
      </span>
    </Field>
  );

  const plainMoney = (label: string, field: keyof CalculationInput, className?: string) => (
    <Field label={label} className={className}>
      <input
        type="text"
        inputMode="numeric"
        name={field}
        value={inputs[field] ? fmt(inputs[field] as number) : ''}
        onChange={(e) => onChange(field, parseFormatted(e.target.value))}
      />
    </Field>
  );

  return (
    <form className="plate" onSubmit={(e) => e.preventDefault()}>
      <div className="lanes" role="group" aria-label="Calculator mode">
        <button
          type="button"
          aria-pressed={!reverseMode}
          className={!reverseMode ? 'active' : ''}
          onClick={() => reverseMode && onToggleMode()}
        >
          <span className="lanes__title">Payment</span>
          <span className="lanes__hint">enter a price</span>
        </button>
        <button
          type="button"
          aria-pressed={reverseMode}
          className={reverseMode ? 'active' : ''}
          onClick={() => !reverseMode && onToggleMode()}
        >
          <span className="lanes__title">Max price</span>
          <span className="lanes__hint">enter a budget</span>
        </button>
      </div>

      <fieldset>
        <legend>The vehicle</legend>
        <div className="fields fields--three">
          <Field label="Province or territory">
            <select name="provinceCode" value={provinceCode} onChange={(e) => onChange('provinceCode', e.target.value)}>
              {PROVINCES.map((p) => (
                <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
              ))}
            </select>
          </Field>
          <Field label="Model year">
            <select name="vehicleYear" value={inputs.vehicleYear} onChange={(e) => onYearChange(parseInt(e.target.value))}>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </Field>
          <Field label="Condition">
            <select
              name="vehicleCondition"
              value={inputs.vehicleCondition || 'used'}
              onChange={(e) => onChange('vehicleCondition', e.target.value as VehicleCondition)}
            >
              <option value="used">Used</option>
              <option value="new">New</option>
            </select>
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>{reverseMode ? 'The budget' : 'The deal'}</legend>
        <div className="fields">
          {reverseMode ? (
            <>
              <Field label="Target bi-weekly ($)">
                <input
                  type="text"
                  inputMode="numeric"
                  name="targetBiWeekly"
                  value={targetBiWeeklyPayment ? fmt(targetBiWeeklyPayment) : ''}
                  onChange={(e) => onTargetBiWeeklyChange(parseFormatted(e.target.value))}
                />
              </Field>
              <Field label="Target monthly ($)">
                <input
                  type="text"
                  inputMode="numeric"
                  name="targetMonthly"
                  value={targetMonthlyPayment ? fmt(targetMonthlyPayment) : ''}
                  onChange={(e) => onTargetMonthlyChange(parseFormatted(e.target.value))}
                />
              </Field>
              {interestRateField}
            </>
          ) : (
            <>
              {plainMoney('Vehicle price ($)', 'vehiclePrice', 'field--lead')}
              {interestRateField}
            </>
          )}
          {termField}
        </div>
      </fieldset>

      <fieldset>
        <legend>Cash and trade</legend>
        <div className="fields fields--three">
          <Field
            label="Down payment ($)"
            note={results.minDownPaymentRequired > 0
              ? downPaymentRaised
                ? `Raised to the minimum for ${inputs.vehicleYear}: $${results.minDownPaymentRequired.toLocaleString()}`
                : `Minimum required: $${results.minDownPaymentRequired.toLocaleString()}`
              : undefined}
            tone={flagDownPayment ? 'error' : undefined}
          >
            <input
              type="text"
              inputMode="numeric"
              name="downPayment"
              value={inputs.downPayment ? fmt(inputs.downPayment) : ''}
              onChange={(e) => onChange('downPayment', parseFormatted(e.target.value))}
              onBlur={onCommitDownPayment}
            />
          </Field>
          {plainMoney('Trade-in value ($)', 'tradeInValue')}
          {plainMoney('Lien on trade-in ($)', 'lienAmount')}
        </div>
      </fieldset>

      <fieldset>
        <legend>Fees and products</legend>
        <p className="fieldset__note">
          Taxable, except PPSA and insurance. Insurance premiums are tax exempt everywhere but Quebec, which charges 9% QST.
        </p>
        <div className="fields fields--three">
          {plainMoney('Licensing fee ($)', 'licensingFee')}
          {plainMoney('Lender admin fee ($)', 'lenderAdminFee')}
          {plainMoney('Dealer admin fee ($)', 'dealerAdminFee')}
          <Field label="PPSA fee ($)" note="Approximate. Lenders charge $32 to $99. Financed, not taxed.">
            <input
              type="text"
              inputMode="numeric"
              name="ppsaFee"
              value={inputs.ppsaFee !== undefined ? fmt(inputs.ppsaFee) : ''}
              onChange={(e) => onChange('ppsaFee', parseFormatted(e.target.value))}
            />
          </Field>
          <Field label="Warranty ($)">
            <MoneyInput name="warranty" value={inputs.warranty ?? 0} onChange={(v) => onChange('warranty', v)} />
          </Field>
          {plainMoney('Safety certification ($)', 'safetyCertification')}
          <Field label="Other fees or products ($)">
            <MoneyInput name="otherFees" value={inputs.otherFees ?? 0} onChange={(v) => onChange('otherFees', v)} />
          </Field>
          <Field
            className="field--span2"
            label="Insurance: GAP, life, A&H ($)"
            note={provinceCode === 'QC'
              ? '9% QST applies to insurance premiums in Quebec.'
              : `Tax-exempt premium in ${provinceName}. Financed, not taxed.`}
          >
            <MoneyInput name="insuranceProducts" value={inputs.insuranceProducts ?? 0} onChange={(v) => onChange('insuranceProducts', v)} />
          </Field>
        </div>
      </fieldset>

      <button type="button" className="btn-ghost" onClick={onReset} title="Reset all fields to defaults">
        Reset all fields
      </button>
    </form>
  );
};

export default LoanInputs;
