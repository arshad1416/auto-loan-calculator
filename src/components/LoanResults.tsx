import type { CalculationInput, CalculationResult } from '../lib/calculator';
import { PROVINCES } from '../lib/calculator';
import DotMatrix from './DotMatrix';
import { LimitSign } from './Signs';

interface Props {
  inputs: CalculationInput;
  results: CalculationResult;
  reverseMode: boolean;
  targetBiWeeklyPayment: number;
  targetMonthlyPayment: number;
}

const fmt = (n: number, decimals = 2) =>
  n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const whole = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

/** Narrowest board the headline figure sits on; longer figures widen it. */
const MIN_BOARD_COLS = 9;

const TIER_TONE: Record<string, string> = { Prime: 'green', Limited: 'yellow' };

const LoanResults: React.FC<Props> = ({ inputs, results, reverseMode, targetBiWeeklyPayment, targetMonthlyPayment }) => {
  const selectedProv = PROVINCES.find((p) => p.code === (inputs.provinceCode || 'ON')) || PROVINCES[0];

  const headline = reverseMode ? `$${whole(results.maxVehiclePrice)}` : `$${fmt(results.biWeeklyPayment)}`;
  const headlineLabel = reverseMode ? 'Max vehicle price, before tax' : 'Bi-weekly payment';

  const included = [
    `$${results.licensingFee.toLocaleString()} licensing`,
    selectedProv.regulatingFee > 0 && `$${selectedProv.regulatingFee} ${selectedProv.regulatingFeeName}`,
    results.lenderAdminFee > 0 && `$${results.lenderAdminFee.toLocaleString()} lender admin`,
    results.dealerAdminFee > 0 && `$${results.dealerAdminFee.toLocaleString()} dealer admin`,
    results.ppsaFee > 0 && `$${results.ppsaFee.toLocaleString()} PPSA (approx.)`,
    results.warranty > 0 && `$${results.warranty.toLocaleString()} warranty`,
    results.safetyCertification > 0 && `$${results.safetyCertification.toLocaleString()} safety cert`,
    results.otherFees > 0 && `$${results.otherFees.toLocaleString()} other fees`,
  ].filter(Boolean);

  return (
    <aside className="board" aria-label="Results">
      <div className="board__display">
        <div className="board__label">{headlineLabel}</div>
        <div className="vms vms--headline">
          <DotMatrix lines={[headline]} cols={Math.max(MIN_BOARD_COLS, headline.length)} wipeMs={380} />
        </div>
        <p className="sr-only" aria-live="polite" data-testid="headline-figure">
          {headlineLabel}: {headline}
        </p>

        <dl className="board__pair">
          {reverseMode ? (
            <>
              <div>
                <dt>Bi-weekly budget</dt>
                <dd>${targetBiWeeklyPayment.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Monthly budget</dt>
                <dd>${targetMonthlyPayment.toLocaleString()}</dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt>Monthly payment</dt>
                <dd data-testid="monthly-payment">${fmt(results.monthlyPayment)}</dd>
              </div>
              <div>
                <dt>Term and rate</dt>
                <dd>{inputs.termMonths} mo at {inputs.apr}%</dd>
              </div>
            </>
          )}
        </dl>
      </div>

      <div className="board__signs">
        <LimitSign caption={['Maximum', 'term']} value={results.maxTermAllowed} unit="months" />
        <LimitSign caption={['Rate', 'floor']} value={results.minApr} unit="percent" compact />
        <div className={`sign sign--tier sign--${TIER_TONE[results.financingTier] ?? 'orange'} retro`}>
          <span className="sign__caption">Financing tier</span>
          <span className="sign__tier">{results.financingTier}</span>
          <span className="sign__caption">
            {results.isBankFinancable ? 'Bank financeable' : 'Specialty lenders only'}
          </span>
        </div>
      </div>

      <dl className="ledger">
        <div>
          <dt>Sales tax ({selectedProv.taxType})</dt>
          <dd>
            ${fmt(results.hst)}
            {selectedProv.taxType === 'GST+PST' && (
              <small>GST ${fmt(results.gst || 0)} · PST ${fmt(results.pst || 0)}</small>
            )}
            {selectedProv.taxType === 'GST' && <small>GST at 5%: ${fmt(results.gst || 0)}</small>}
            {results.luxuryTax !== undefined && results.luxuryTax > 0 && (
              <small className="ledger__flag">Luxury tax: ${fmt(results.luxuryTax)}</small>
            )}
            {results.insuranceProducts > 0 && (
              <small>
                {results.provinceCode === 'QC'
                  ? `Includes 9% QST on insurance ($${fmt(Math.round(results.insuranceTax))})`
                  : `Insurance $${fmt(results.insuranceProducts)} is tax exempt`}
              </small>
            )}
          </dd>
        </div>
        <div>
          <dt>Amount financed</dt>
          <dd>${whole(results.loanPrincipal)}</dd>
        </div>
        <div>
          <dt>Total interest</dt>
          <dd>${whole(results.totalInterest)}</dd>
        </div>
        <div>
          <dt>Total loan cost</dt>
          <dd>${whole(results.totalCost)}</dd>
        </div>
        <div>
          <dt>Condition</dt>
          <dd className="ledger__word">{inputs.vehicleCondition || 'used'}</dd>
        </div>
      </dl>

      {(results.financedNegativeEquity > 0 || results.excessNegativeEquity > 0) && (
        <div className={`notice${results.excessNegativeEquity > 0 ? ' notice--over' : ''}`}>
          <strong>Negative equity (lien minus trade-in)</strong>
          <span>${results.financedNegativeEquity.toLocaleString()} rolled into financing.</span>
          {results.excessNegativeEquity > 0 && (
            <span>
              ${results.excessNegativeEquity.toLocaleString()} is past the 40% cap and has been added to the minimum down payment.
            </span>
          )}
        </div>
      )}

      <p className="board__included">Includes {included.join(', ')}.</p>
    </aside>
  );
};

export default LoanResults;
