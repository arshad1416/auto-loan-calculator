import { calculateAutoLoan } from './calculator';
import type { CalculationInput, CalculationResult } from './calculator';

// ── Types ───────────────────────────────────────────────────────────

export interface Adjustment {
  apr: { from: number; to: number } | null;
  termMonths: { from: number; to: number } | null;
  downPayment: { from: number; to: number } | null;
}

export interface CalculatorState {
  inputs: CalculationInput;
  results: CalculationResult;
  showSchedule: boolean;
  adjustments: Adjustment | null;
}

export type CalculatorAction =
  | { type: 'SET_FIELD'; field: keyof CalculationInput; value: number }
  | { type: 'SET_YEAR'; year: number }
  | { type: 'TOGGLE_SCHEDULE' }
  | { type: 'DISMISS_ADJUSTMENTS' };

// ── URL sync ────────────────────────────────────────────────────────

const PARAM_KEYS: Record<keyof CalculationInput, string> = {
  vehicleYear: 'year',
  vehiclePrice: 'price',
  tradeInValue: 'trade',
  downPayment: 'down',
  apr: 'apr',
  termMonths: 'term',
};

function readParams(): Partial<CalculationInput> {
  const params = new URLSearchParams(window.location.search);
  const out: Partial<CalculationInput> = {};
  for (const [key, param] of Object.entries(PARAM_KEYS)) {
    const v = params.get(param);
    if (v !== null && !isNaN(Number(v))) {
      (out as Record<string, number>)[key] = Number(v);
    }
  }
  return out;
}

export function syncURL(inputs: CalculationInput): void {
  const params = new URLSearchParams();
  for (const [key, param] of Object.entries(PARAM_KEYS)) {
    params.set(param, String(inputs[key as keyof CalculationInput]));
  }
  const qs = params.toString();
  const url = window.location.pathname + (qs ? '?' + qs : '');
  window.history.replaceState(null, '', url);
}

// ── Defaults ────────────────────────────────────────────────────────

const DEFAULTS: CalculationInput = {
  vehicleYear: new Date().getFullYear(),
  vehiclePrice: 45000,
  tradeInValue: 0,
  downPayment: 5000,
  apr: 6.99,
  termMonths: 84,
};

// ── Initial state ───────────────────────────────────────────────────

export function createInitialState(): CalculatorState {
  const urlOverrides = readParams();
  const inputs = { ...DEFAULTS, ...urlOverrides };
  const results = calculateAutoLoan(inputs);
  // Clamp to valid rules on init (in case URL had stale values)
  inputs.apr = results.minApr;
  inputs.termMonths = Math.min(inputs.termMonths, results.maxTermAllowed);
  inputs.downPayment = Math.max(inputs.downPayment, results.minDownPaymentRequired);
  return {
    inputs,
    results: calculateAutoLoan(inputs),
    showSchedule: false,
    adjustments: null,
  };
}

// ── Reducer ─────────────────────────────────────────────────────────

export function calculatorReducer(state: CalculatorState, action: CalculatorAction): CalculatorState {
  switch (action.type) {
    case 'SET_FIELD': {
      const newInputs = { ...state.inputs, [action.field]: action.value };
      return {
        ...state,
        inputs: newInputs,
        results: calculateAutoLoan(newInputs),
        adjustments: null,
      };
    }

    case 'SET_YEAR': {
      const oldInputs = state.inputs;
      const year = action.year;

      // Ignore intermediate keystrokes — only apply rules for valid model years
      if (year < 2010) {
        return {
          ...state,
          inputs: { ...oldInputs, vehicleYear: year },
          adjustments: null,
        };
      }

      const newInputs = { ...oldInputs, vehicleYear: year };
      const rulesResult = calculateAutoLoan(newInputs);

      // Always reset to rules-based minimums on year change.
      // Previously we only clamped upward (apr < minApr), so an APR
      // pushed high by an intermediate keystroke (e.g. year=2 → 19.99%)
      // would never come back down when the full year was entered.
      const finalInputs = {
        ...newInputs,
        apr: rulesResult.minApr,
        termMonths: Math.min(newInputs.termMonths, rulesResult.maxTermAllowed),
        downPayment: Math.max(newInputs.downPayment, rulesResult.minDownPaymentRequired),
      };

      const adjustments: Adjustment = {
        apr: oldInputs.apr !== finalInputs.apr ? { from: oldInputs.apr, to: finalInputs.apr } : null,
        termMonths: oldInputs.termMonths !== finalInputs.termMonths ? { from: oldInputs.termMonths, to: finalInputs.termMonths } : null,
        downPayment: oldInputs.downPayment !== finalInputs.downPayment ? { from: oldInputs.downPayment, to: finalInputs.downPayment } : null,
      };

      const hasAdjustments = adjustments.apr || adjustments.termMonths || adjustments.downPayment;

      return {
        ...state,
        inputs: finalInputs,
        results: calculateAutoLoan(finalInputs),
        adjustments: hasAdjustments ? adjustments : null,
      };
    }

    case 'TOGGLE_SCHEDULE':
      return { ...state, showSchedule: !state.showSchedule, adjustments: null };

    case 'DISMISS_ADJUSTMENTS':
      return { ...state, adjustments: null };

    default:
      return state;
  }
}
