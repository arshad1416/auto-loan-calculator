import { useReducer, useEffect, useRef } from 'react';
import {
  createInitialState,
  calculatorReducer,
  syncURL,
} from './lib/calculator-reducer';
import LoanInputs from './components/LoanInputs';
import LoanResults from './components/LoanResults';
import AmortizationSchedule from './components/AmortizationSchedule';
import Disclaimer from './components/Disclaimer';

const App: React.FC = () => {
  const [state, dispatch] = useReducer(calculatorReducer, undefined, createInitialState);
  const urlTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sync URL after state changes (debounced)
  useEffect(() => {
    clearTimeout(urlTimer.current);
    urlTimer.current = setTimeout(() => syncURL(state), 400);
    return () => clearTimeout(urlTimer.current);
  }, [state.inputs, state.reverseMode, state.targetBiWeeklyPayment, state.targetMonthlyPayment]);

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
          parts.push(`APR adjusted to ${state.adjustments.apr.to}%`);
        }
        if (state.adjustments.termMonths) {
          parts.push(`term adjusted to ${state.adjustments.termMonths.to} months`);
        }
        if (state.adjustments.downPayment) {
          parts.push(
            `minimum down payment of $${state.adjustments.downPayment.to.toLocaleString()} applied`,
          );
        }
        return `Vehicle year changed — ${parts.join(', ')}`;
      })()
    : null;

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '5rem' }}>
      <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1>
          SHIFT<span style={{ color: 'var(--accent-color)' }}>LOGIC</span> HQ
        </h1>
        <p className="subtitle">Un-Official Dealer Payment Calculator</p>
      </header>

      {adjustmentMessage && (
        <div
          className="adjustment-banner animate-fade-in"
          onClick={() => dispatch({ type: 'DISMISS_ADJUSTMENTS' })}
        >
          {adjustmentMessage}
        </div>
      )}

      <div className="app-grid">
        <LoanInputs
          inputs={state.inputs}
          results={state.results}
          reverseMode={state.reverseMode}
          targetBiWeeklyPayment={state.targetBiWeeklyPayment}
          targetMonthlyPayment={state.targetMonthlyPayment}
          onChange={(field, value) => dispatch({ type: 'SET_FIELD', field, value: value as number })}
          onYearChange={(year) => dispatch({ type: 'SET_YEAR', year })}
          onToggleMode={() => dispatch({ type: 'TOGGLE_MODE' })}
          onTargetBiWeeklyChange={(value) => dispatch({ type: 'SET_TARGET_BIWEEKLY', value })}
          onTargetMonthlyChange={(value) => dispatch({ type: 'SET_TARGET_MONTHLY', value })}
        />
        <LoanResults
          inputs={state.inputs}
          results={state.results}
          reverseMode={state.reverseMode}
          targetBiWeeklyPayment={state.targetBiWeeklyPayment}
          targetMonthlyPayment={state.targetMonthlyPayment}
        />
      </div>

      <AmortizationSchedule
        schedule={state.results.schedule}
        visible={state.showSchedule}
        onToggle={() => dispatch({ type: 'TOGGLE_SCHEDULE' })}
      />

      <Disclaimer />

      <footer style={{ marginTop: '4rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
        &copy; {new Date().getFullYear()} ShiftLogic HQ Automation Hub. All calculations are estimates.
      </footer>
    </div>
  );
};

export default App;
