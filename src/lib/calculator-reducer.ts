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
  /** Terms the user picked, keyed by vehicle year, so switching years and back restores their choice. */
  termByYear: Record<number, number>;
  /** True when we raised the down payment to the year's minimum, so the note can stay red. */
  downPaymentRaised: boolean;
}

export type CalculatorAction =
  | { type: 'SET_FIELD'; field: keyof CalculationInput; value: number | string }
  | { type: 'COMMIT_DOWN_PAYMENT' }
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
  apr: 7.99,
  termMonths: 84,
  licensingFee: 59,
  lenderAdminFee: 0,
  dealerAdminFee: 0,
  ppsaFee: 60, // approximate — varies by lender, $32-$99 observed on 2026 contracts
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
    apr: s.inputs.apr,
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
  inputs.downPayment = results.minDownPaymentRequired;

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
    termByYear: {},
    downPaymentRaised: false,
  };

  if (reverseMode) {
    initialState.inputs.termMonths = initialState.results.maxTermAllowed;
    initialState.results = runReverseCalc(initialState, {});
    initialState.inputs.downPayment = initialState.results.minDownPaymentRequired;
    initialState.inputs.vehiclePrice = initialState.results.maxVehiclePrice;
    // Re-run with clamped down payment
    initialState.results = runReverseCalc(initialState, {});
  }

  return initialState;
}

// ── Reducer ─────────────────────────────────────────────────────────

/** Records a manually chosen term against the current vehicle year. */
function rememberTerm(
  state: CalculatorState,
  action: { field: keyof CalculationInput },
  newInputs: CalculationInput,
): Record<number, number> {
  if (action.field !== 'termMonths') return state.termByYear;
  return { ...state.termByYear, [newInputs.vehicleYear]: newInputs.termMonths };
}

/** Term to use when switching to `year`: the user's earlier pick for that year, else the year's max. */
function termForYear(state: CalculatorState, year: number, maxTermAllowed: number): number {
  const remembered = state.termByYear[year];
  return Math.min(remembered ?? maxTermAllowed, maxTermAllowed);
}

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
          termByYear: rememberTerm(state, action, newInputs),
          downPaymentRaised: action.field === 'downPayment' ? false : state.downPaymentRaised,
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
        termByYear: rememberTerm(state, action, newInputs),
        // Editing the down payment clears the "we raised it" flag; it re-arms on the next commit.
        downPaymentRaised: action.field === 'downPayment' ? false : state.downPaymentRaised,
      };
    }

    // Fired on blur. Typing is left alone so the user can key through "5" on the way to "5000";
    // only once they leave the field do we raise a short down payment to the year's minimum.
    case 'COMMIT_DOWN_PAYMENT': {
      const required = state.results.minDownPaymentRequired;
      if (state.inputs.downPayment >= required) {
        return state.downPaymentRaised ? { ...state, downPaymentRaised: false } : state;
      }
      const newInputs = { ...state.inputs, downPayment: required };
      if (state.reverseMode) {
        const newState = { ...state, inputs: newInputs };
        const results = runReverseCalc(newState, {});
        return {
          ...state,
          inputs: { ...newInputs, vehiclePrice: results.maxVehiclePrice },
          results,
          adjustments: null,
          downPaymentRaised: true,
        };
      }
      return {
        ...state,
        inputs: newInputs,
        results: calculateAutoLoan(newInputs),
        adjustments: null,
        downPaymentRaised: true,
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
        // minApr is advisory, not a floor: keep the user's rate on a year change. Real lender rates
        // are set by credit tier, not model year, so a rate below minApr is legitimate. The rate input
        // shows a "below market rate" warning instead of silently overriding the entered value.
        const clampedApr = newInputs.apr;
        const finalInputs = { ...newInputs, apr: clampedApr };
        // Restore the term the user previously chose for this year; otherwise use the year's max.
        const inputsForCalc = { ...finalInputs, termMonths: termForYear(state, year, rulesResult.maxTermAllowed) };
        // The down payment is left as entered. The "Min Down Required" note tells the user what the
        // new year needs; it is only raised on blur (COMMIT_DOWN_PAYMENT).
        const results = runReverseCalc({ ...state, inputs: inputsForCalc }, {});
        const inputsWithClampedDown = { ...inputsForCalc, vehiclePrice: results.maxVehiclePrice };

        const adjustments: Adjustment = {
          apr: null,
          termMonths: oldInputs.termMonths !== inputsForCalc.termMonths ? { from: oldInputs.termMonths, to: inputsForCalc.termMonths } : null,
          downPayment: null,
        };

        const finalState = {
          ...state,
          inputs: inputsWithClampedDown,
          results: runReverseCalc({ ...state, inputs: inputsWithClampedDown }, {}),
          downPaymentRaised: false,
        };

        return {
          ...finalState,
          adjustments: adjustments.termMonths ? adjustments : null,
        };
      }

      // Forward mode
      const newInputs = { ...oldInputs, vehicleYear: year };
      const rulesResult = calculateAutoLoan(newInputs);

      const finalInputs = {
        ...newInputs,
        // Rate still re-seeds from the year: the tool is an estimate keyed on year/price/down payment.
        apr: rulesResult.minApr,
        // Restore the term the user previously chose for this year; otherwise use the year's max.
        termMonths: termForYear(state, year, rulesResult.maxTermAllowed),
        // Down payment is left as entered — the "Min Down Required" note communicates the new
        // requirement, and it is only raised on blur (COMMIT_DOWN_PAYMENT).
      };

      const adjustments: Adjustment = {
        apr: oldInputs.apr !== finalInputs.apr ? { from: oldInputs.apr, to: finalInputs.apr } : null,
        termMonths: oldInputs.termMonths !== finalInputs.termMonths ? { from: oldInputs.termMonths, to: finalInputs.termMonths } : null,
        downPayment: null,
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
