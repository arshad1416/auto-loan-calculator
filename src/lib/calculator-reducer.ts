import { calculateAutoLoan, reverseCalculateAutoLoan, PROVINCES } from './calculator';
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
  | { type: 'SET_FIELD'; field: keyof CalculationInput; value: number | string }
  | { type: 'SET_YEAR'; year: number }
  | { type: 'TOGGLE_SCHEDULE' }
  | { type: 'DISMISS_ADJUSTMENTS' }
  | { type: 'TOGGLE_MODE' }
  | { type: 'SET_TARGET_BIWEEKLY'; value: number }
  | { type: 'SET_TARGET_MONTHLY'; value: number }
  | { type: 'RESET' };

// ── No URL state — all state is in-memory only ──────────────────────

export function syncURL(_state: CalculatorState): void {
  // No-op: state is stored in React memory only, never in the URL
}

// ── Defaults ────────────────────────────────────────────────────────

const DEFAULTS: CalculationInput = {
  vehicleYear: new Date().getFullYear(),
  vehiclePrice: 0,
  tradeInValue: 0,
  lienAmount: 0,
  downPayment: 0,
  apr: 6.99,
  termMonths: 84,
  licensingFee: 59,
  lenderAdminFee: 0,
  dealerAdminFee: 0,
  warranty: 0,
  safetyCertification: 0,
  otherFees: 0,
};

function runReverseCalc(state: CalculatorState, overrides: Partial<CalculatorState>): CalculationResult {
  const s = { ...state, ...overrides };
  return reverseCalculateAutoLoan({
    targetBiWeeklyPayment: s.targetBiWeeklyPayment,
    targetMonthlyPayment: s.targetMonthlyPayment,
    vehicleYear: s.inputs.vehicleYear,
    tradeInValue: s.inputs.tradeInValue,
    lienAmount: s.inputs.lienAmount,
    downPayment: s.inputs.downPayment,
    termMonths: s.inputs.termMonths,
    licensingFee: s.inputs.licensingFee,
    provinceCode: s.inputs.provinceCode,
    vehicleCondition: s.inputs.vehicleCondition,
    lenderAdminFee: s.inputs.lenderAdminFee,
    dealerAdminFee: s.inputs.dealerAdminFee,
    warranty: s.inputs.warranty,
    safetyCertification: s.inputs.safetyCertification,
    otherFees: s.inputs.otherFees,
  });
}

// ── Initial state ───────────────────────────────────────────────────

export function createInitialState(_skipUrl = false): CalculatorState {
  const inputs = { ...DEFAULTS };

  // Apply province defaults for licensing and lender fees
  if (inputs.provinceCode) {
    const province = PROVINCES.find(p => p.code === inputs.provinceCode);
    if (province) inputs.licensingFee = province.defaultLicensingFee;
  }
  {
    const provCode = inputs.provinceCode || 'ON';
    inputs.lenderAdminFee = provCode === 'ON' ? 2000 : 0;
  }

  const results = calculateAutoLoan(inputs);
  inputs.apr = results.minApr;
  inputs.termMonths = Math.min(inputs.termMonths, results.maxTermAllowed);
  inputs.downPayment = Math.max(inputs.downPayment, results.minDownPaymentRequired);

  const reverseMode = false;
  const targetBiWeeklyPayment = 500;
  const targetMonthlyPayment = Math.round(500 * 26 / 12);

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
    initialState.inputs.termMonths = initialState.results.maxTermAllowed;
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
        let newInputs = { ...state.inputs, [action.field]: action.value };
        if (action.field === 'provinceCode' && typeof action.value === 'string') {
          const province = PROVINCES.find(p => p.code === action.value);
          if (province) {
            newInputs = { ...newInputs, licensingFee: province.defaultLicensingFee, lenderAdminFee: action.value === 'ON' ? 2000 : 0 };
          }
        }
        const newState = { ...state, inputs: newInputs };
        const results = runReverseCalc(newState, {});
        return {
          ...state,
          inputs: { ...newInputs, vehiclePrice: results.maxVehiclePrice },
          results,
          adjustments: null,
        };
      }
      let newInputs = { ...state.inputs, [action.field]: action.value };
      if (action.field === 'provinceCode' && typeof action.value === 'string') {
        const province = PROVINCES.find(p => p.code === action.value);
        if (province) {
          newInputs = { ...newInputs, licensingFee: province.defaultLicensingFee, lenderAdminFee: action.value === 'ON' ? 2000 : 0 };
        }
      }
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
        const rulesResult = calculateAutoLoan(newInputs);
        // Reset term to max for new year
        const inputsForCalc = { ...newInputs, termMonths: rulesResult.maxTermAllowed };
        const results = runReverseCalc({ ...state, inputs: inputsForCalc }, {});
        const finalDown = Math.max(inputsForCalc.downPayment, results.minDownPaymentRequired);
        const inputsWithClampedDown = { ...inputsForCalc, downPayment: finalDown, vehiclePrice: results.maxVehiclePrice };

        const adjustments: Adjustment = {
          apr: null, // APR not user-editable in reverse mode
          termMonths: oldInputs.termMonths !== inputsForCalc.termMonths ? { from: oldInputs.termMonths, to: inputsForCalc.termMonths } : null,
          downPayment: oldInputs.downPayment !== finalDown ? { from: oldInputs.downPayment, to: finalDown } : null,
        };

        const finalState = {
          ...state,
          inputs: inputsWithClampedDown,
          results: runReverseCalc({ ...state, inputs: inputsWithClampedDown }, {}),
        };

        const hasAdj = adjustments.termMonths || adjustments.downPayment;
        return {
          ...finalState,
          adjustments: hasAdj ? adjustments : null,
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
        inputs: { ...state.inputs, downPayment, termMonths: state.results.maxTermAllowed },
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

    case 'RESET':
      return createInitialState(true);

    default:
      return state;
  }
}
