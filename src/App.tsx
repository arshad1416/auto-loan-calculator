import { useReducer, useEffect } from 'react';
import {
  createInitialState,
  calculatorReducer,
} from './lib/calculator-reducer';
import { EXAMPLE_ACTIONS } from './lib/example-deal';
import Hero from './components/Hero';
import ProvinceStrip from './components/ProvinceStrip';
import LoanInputs from './components/LoanInputs';
import LoanResults from './components/LoanResults';
import AmortizationSchedule from './components/AmortizationSchedule';
import MarketRead from './components/MarketRead';
import RoadAhead from './components/RoadAhead';
import LenderLimits from './components/LenderLimits';
import Disclaimer from './components/Disclaimer';

/** Raises each `[data-reveal]` element into place the first time it scrolls into view. */
function useScrollReveal() {
  useEffect(() => {
    const targets = document.querySelectorAll('[data-reveal]');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

/** Signs are retroreflective: a glint follows the pointer across any `.retro` surface. */
function useHeadlightGlint() {
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const sign = (e.target as Element | null)?.closest<HTMLElement>('.retro');
      if (!sign) return;
      const box = sign.getBoundingClientRect();
      sign.style.setProperty('--glint-x', `${e.clientX - box.left}px`);
      sign.style.setProperty('--glint-y', `${e.clientY - box.top}px`);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => document.removeEventListener('pointermove', onMove);
  }, []);
}

const App: React.FC = () => {
  const [state, dispatch] = useReducer(calculatorReducer, undefined, createInitialState);

  useScrollReveal();
  useHeadlightGlint();

  // Auto-dismiss adjustments after 6 seconds
  useEffect(() => {
    if (!state.adjustments) return;
    const timer = setTimeout(() => dispatch({ type: 'DISMISS_ADJUSTMENTS' }), 6000);
    return () => clearTimeout(timer);
  }, [state.adjustments]);

  const adjustmentMessage = state.adjustments
    ? (() => {
        const parts: string[] = [];
        if (state.adjustments.apr) {
          parts.push(`interest rate adjusted to ${state.adjustments.apr.to}%`);
        }
        if (state.adjustments.termMonths) {
          parts.push(`term adjusted to ${state.adjustments.termMonths.to} months`);
        }
        if (state.adjustments.downPayment) {
          parts.push(
            `minimum down payment of $${state.adjustments.downPayment.to.toLocaleString()} applied`,
          );
        }
        return `Model year changed: ${parts.join(', ')}.`;
      })()
    : null;

  const livePayment =
    !state.reverseMode && state.inputs.vehiclePrice > 0
      ? { biWeekly: state.results.biWeeklyPayment, monthly: state.results.monthlyPayment }
      : null;

  return (
    <div id="top">
      <Hero
        livePayment={livePayment}
        onLoadExample={() => EXAMPLE_ACTIONS.forEach(dispatch)}
        onStartFromBudget={() => !state.reverseMode && dispatch({ type: 'TOGGLE_MODE' })}
      />
      <ProvinceStrip />

      <main>
        <section className="section calculator" id="calculator">
          <header className="section__head" data-reveal>
            <p className="exit-tab">The calculator</p>
            <h2>Work the deal.</h2>
            <p className="section__lede">
              Enter a price to get the payment, or switch lanes and enter a payment to get the price. Everything
              recalculates as you type.
            </p>
          </header>

          {adjustmentMessage && (
            <button
              type="button"
              className="adjustment"
              onClick={() => dispatch({ type: 'DISMISS_ADJUSTMENTS' })}
            >
              {adjustmentMessage}
            </button>
          )}

          <div className="calc-grid">
            <LoanInputs
              inputs={state.inputs}
              results={state.results}
              reverseMode={state.reverseMode}
              targetBiWeeklyPayment={state.targetBiWeeklyPayment}
              targetMonthlyPayment={state.targetMonthlyPayment}
              onChange={(field, value) => dispatch({ type: 'SET_FIELD', field, value: value as number })}
              onCommitDownPayment={() => dispatch({ type: 'COMMIT_DOWN_PAYMENT' })}
              downPaymentRaised={state.downPaymentRaised}
              onYearChange={(year) => dispatch({ type: 'SET_YEAR', year })}
              onToggleMode={() => dispatch({ type: 'TOGGLE_MODE' })}
              onTargetBiWeeklyChange={(value) => dispatch({ type: 'SET_TARGET_BIWEEKLY', value })}
              onTargetMonthlyChange={(value) => dispatch({ type: 'SET_TARGET_MONTHLY', value })}
              onReset={() => dispatch({ type: 'RESET' })}
            />
            <LoanResults
              inputs={state.inputs}
              results={state.results}
              reverseMode={state.reverseMode}
              targetBiWeeklyPayment={state.targetBiWeeklyPayment}
              targetMonthlyPayment={state.targetMonthlyPayment}
            />
          </div>

          {state.reverseMode && state.results.maxVehiclePrice > 0 && (
            <MarketRead maxPrice={state.results.maxVehiclePrice} provinceCode={state.inputs.provinceCode || 'ON'} />
          )}

          <AmortizationSchedule
            schedule={state.results.schedule}
            visible={state.showSchedule}
            onToggle={() => dispatch({ type: 'TOGGLE_SCHEDULE' })}
            loanPrincipal={state.results.loanPrincipal}
            apr={state.inputs.apr}
            termMonths={state.inputs.termMonths}
            biWeeklyPayment={state.results.biWeeklyPayment}
          />
        </section>

        <div className="lane-divider" aria-hidden="true" />
        <RoadAhead />
        <div className="lane-divider" aria-hidden="true" />
        <LenderLimits />
        <Disclaimer />
      </main>

      <footer className="footer">
        <a className="wordmark" href="#top">
          <span className="wordmark__mark" aria-hidden="true" />
          <span>Shift<b>Logic</b> HQ</span>
        </a>
        <p>Un-official dealer payment calculator. All calculations are estimates.</p>
        <p>&copy; {new Date().getFullYear()} ShiftLogic HQ Automation Hub</p>
      </footer>
    </div>
  );
};

export default App;
