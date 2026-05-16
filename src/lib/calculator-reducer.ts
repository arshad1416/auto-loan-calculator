import { calculateAutoLoan, reverseCalculateAutoLoan } from './calculator';
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
  reverseMode: boolean;
  targetBiWeeklyPayment: number;
  targetMonthlyPayment: number;
}

export type CalculatorAction =
  | { type: 'SET_FIELD'; field: keyof CalculationInput; value: number }
  | { type: 'SET_YEAR'; year: number }
  | { type: 'TOGGLE_SCHEDULE' }
  | { type: 'DISMISS_ADJUSTMENTS' }
  | { type: 'TOGGLE_MODE' }
  | { type: 'SET_TARGET_BIWEEKLY'; value: number }
  | { type: 'SET_TARGET_MONTHLY'; value: number };

// ── URL sync ────────────────────────────────────────────────────────

const PARAM_KEYS: Record<keyof CalculationInput, string> = {
  vehicleYear: 'year',
  vehiclePrice: 'price',
  tradeInValue: 'trade',
  downPayment: 'down',
  apr: 'apr',
  termMonths: 'term',
  licensingFee: 'licensing',
};

interface URLOverrides extends Partial<CalculationInput> {
  mode?: string;
  targetBiWeekly?: number;
  targetMonthly?: number;
}

function readParams(): URLOverrides {
  const params = new URLSearchParams(window.location.search);
  const out: URLOverrides = {};
  for (const [key, param] of Object.entries(PARAM_KEYS)) {
    const v = params.get(param);
    if (v !== null && !isNaN(Number(v))) {
      (out as Record<string, number>)[key] = Number(v);
    }
  }
  const mode = params.get('mode');
  if (mode) out.mode = mode;
  const tbw = params.get('targetBiWeekly');
  if (tbw !== null && !isNaN(Number(tbw))) out.targetBiWeekly = Number(tbw);
  const tm = params.get('targetMonthly');
  if (tm !== null && !isNaN(Number(tm))) out.targetMonthly = Number(tm);
  return out;
}

export function syncURL(state: CalculatorState): void {
  const params = new URLSearchParams();
  for (const [key, param] of Object.entries(PARAM_KEYS)) {
    params.set(param, String(state.inputs[key as keyof CalculationInput]));
  }
  if (state.reverseMode) {
    params.set('mode', 'reverse');
    params.set('targetBiWeekly', String(state.targetBiWeeklyPayment));
    params.set('targetMonthly', String(state.targetMonthlyPayment));
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
  licensingFee: 56,
};

function runReverseCalc(state: CalculatorState, overrides: Partial<CalculatorState>): CalculationResult {
  const s = { ...state, ...overrides };
  return reverseCalculateAutoLoan({
    targetBiWeeklyPayment: s.targetBiWeeklyPayment,
    targetMonthlyPayment: s.targetMonthlyPayment,
    vehicleYear: s.inputs.vehicleYear,
    tradeInValue: s.inputs.tradeInValue,
    downPayment: s.inputs.downPayment,
    licensingFee: s.inputs.licensingFee,
  });
}

// ── Initial state ───────────────────────────────────────────────────

export function createInitialState(): CalculatorState {
  const urlOverrides = readParams();
  const inputs = { ...DEFAULTS, ...urlOverrides };
  const results = calculateAutoLoan(inputs);
  inputs.apr = results.minApr;
  inputs.termMonths = Math.min(inputs.termMonths, results.maxTermAllowed);
  inputs.downPayment = Math.max(inputs.downPayment, results.minDownPaymentRequired);

  const reverseMode = urlOverrides.mode === 'reverse';
  const targetBiWeeklyPayment = urlOverrides.targetBiWeekly ?? 500;
  const targetMonthlyPayment = urlOverrides.targetMonthly ?? Math.round(targetBiWeeklyPayment * 26 / 12);

  const initialState: CalculatorState = {
    inputs,
    results,
    showSchedule: false,
    adjustments: null,
    reverseMode,
    targetBiWeeklyPayment,
    targetMonthlyPayment,
  };

  if (reverseMode) {
    initialState.results = runReverseCalc(initialState, {});
    initialState.inputs.downPayment = Math.max(0, initialState.results.minDownPaymentRequired);
    initialState.inputs.vehiclePrice = initialState.results.maxVehiclePrice;
    // Re-run with clamped down payment
    initialState.results = runReverseCalc(initialState, {});
  }

  return initialState;
}

// ── Reducer ─────────────────────────────────────────────────────────

export function calculatorReducer(state: CalculatorState, action: CalculatorAction): CalculatorState {
  switch (action.type) {
    case 'SET_FIELD': {
      if (state.reverseMode) {
        const newInputs = { ...state.inputs, [action.field]: action.value };
        const newState = { ...state, inputs: newInputs };
        const results = runReverseCalc(newState, {});
        return {
          ...state,
          inputs: { ...newInputs, vehiclePrice: results.maxVehiclePrice },
          results,
          adjustments: null,
        };
      }
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
      if (year < 1990) {
        return { ...state, inputs: { ...oldInputs, vehicleYear: year }, adjustments: null };
      }

      if (state.reverseMode) {
        const newInputs = { ...oldInputs, vehicleYear: year };
        const newState = { ...state, inputs: newInputs };
        const results = runReverseCalc(newState, {});
        const finalDown = Math.max(newInputs.downPayment, results.minDownPaymentRequired);
        const inputsWithClampedDown = { ...newInputs, downPayment: finalDown, vehiclePrice: results.maxVehiclePrice };

        const adjustments: Adjustment = {
          apr: null, // APR not user-editable in reverse mode
          termMonths: null,
          downPayment: oldInputs.downPayment !== finalDown ? { from: oldInputs.downPayment, to: finalDown } : null,
        };

        const finalState = {
          ...state,
          inputs: inputsWithClampedDown,
          results: runReverseCalc({ ...state, inputs: inputsWithClampedDown }, {}),
        };

        return {
          ...finalState,
          adjustments: adjustments.downPayment ? adjustments : null,
        };
      }

      // Forward mode
      const newInputs = { ...oldInputs, vehicleYear: year };
      const rulesResult = calculateAutoLoan(newInputs);

      const finalInputs = {
        ...newInputs,
        apr: rulesResult.minApr,
        termMonths: rulesResult.maxTermAllowed,
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

    case 'TOGGLE_MODE': {
      if (state.reverseMode) {
        // Reverse → Forward: restore from max vehicle price
        const newInputs = { ...state.inputs, vehiclePrice: state.results.maxVehiclePrice };
        return {
          ...state,
          reverseMode: false,
          inputs: newInputs,
          results: calculateAutoLoan(newInputs),
          adjustments: null,
        };
      }
      // Forward → Reverse: seed targets from current results, clamp down to minimum
      const targetBiWeekly = Math.round(state.results.biWeeklyPayment);
      const targetMonthly = Math.round(state.results.monthlyPayment);
      const downPayment = Math.max(0, state.results.minDownPaymentRequired);
      const newState: CalculatorState = {
        ...state,
        reverseMode: true,
        targetBiWeeklyPayment: targetBiWeekly,
        targetMonthlyPayment: targetMonthly,
        inputs: { ...state.inputs, downPayment },
      };
      const results = runReverseCalc(newState, {});
      return {
        ...newState,
        inputs: { ...newState.inputs, vehiclePrice: results.maxVehiclePrice },
        results,
        adjustments: null,
      };
    }

    case 'SET_TARGET_BIWEEKLY': {
      const newMonthly = Math.round((action.value * 26) / 12);
      const newState = {
        ...state,
        targetBiWeeklyPayment: action.value,
        targetMonthlyPayment: newMonthly,
      };
      const results = runReverseCalc(newState, {});
      return {
        ...newState,
        inputs: { ...state.inputs, vehiclePrice: results.maxVehiclePrice },
        results,
        adjustments: null,
      };
    }

    case 'SET_TARGET_MONTHLY': {
      const newBiWeekly = Math.round((action.value * 12) / 26);
      const newState = {
        ...state,
        targetBiWeeklyPayment: newBiWeekly,
        targetMonthlyPayment: action.value,
      };
      const results = runReverseCalc(newState, {});
      return {
        ...newState,
        inputs: { ...state.inputs, vehiclePrice: results.maxVehiclePrice },
        results,
        adjustments: null,
      };
    }

    default:
      return state;
  }
}
