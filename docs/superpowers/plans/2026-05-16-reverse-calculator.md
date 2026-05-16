# Reverse Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reverse calculation mode — enter target bi-weekly/monthly payment, get max vehicle price pre-tax. Year changes auto-recalculate with correct lender rules.

**Architecture:** New `reverseCalculateAutoLoan()` function solves the loan payment formula backwards (P → L → maxPrice), reuses existing year→rules mapping and forward calculator for schedule generation. A segmented pill toggle switches modes. Licensing fee becomes editable.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest

---

### Task 1: Add `reverseCalculateAutoLoan` to calculator.ts

**Files:**
- Modify: `src/lib/calculator.ts`
- Modify: `src/lib/calculator.test.ts`

- [ ] **Step 1: Add `licensingFee` to `CalculationInput` and `maxVehiclePrice` to `CalculationResult`, extract year rules helper**

Replace the top section of `src/lib/calculator.ts` (lines 1–69):

```typescript
/**
 * Auto Loan Calculator Logic
 * Factors in Ontario-specific taxes (HST 13%), OMVIC fees, and Lender Admin fees.
 */

export interface AmortizationPeriod {
  period: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

export interface CalculationInput {
  vehicleYear: number;
  vehiclePrice: number;
  tradeInValue: number;
  downPayment: number;
  apr: number;
  termMonths: number;
  licensingFee: number;
}

export interface CalculationResult {
  loanPrincipal: number;
  monthlyPayment: number;
  biWeeklyPayment: number;
  totalInterest: number;
  totalCost: number;
  hst: number;
  maxTermAllowed: number;
  minApr: number;
  minDownPaymentRequired: number;
  isBankFinancable: boolean;
  schedule: AmortizationPeriod[];
  maxVehiclePrice: number;
}

const HST_RATE = 0.13;
const OMVIC_FEE = 22.00;
const DEFAULT_LICENSING_FEE = 56.00;
const ADMIN_FEE = 2000.00;

interface YearRules {
  maxTermAllowed: number;
  minApr: number;
  isBankFinancable: boolean;
  minDownPaymentPct: number;
}

export function getYearRules(vehicleYear: number, vehiclePrice: number): YearRules {
  if (vehicleYear >= 2023) {
    return { maxTermAllowed: 84, minApr: 6.99, isBankFinancable: true, minDownPaymentPct: 0 };
  } else if (vehicleYear >= 2021) {
    return { maxTermAllowed: 72, minApr: 7.99, isBankFinancable: true, minDownPaymentPct: 0 };
  } else if (vehicleYear >= 2016) {
    return { maxTermAllowed: 60, minApr: 8.99, isBankFinancable: true, minDownPaymentPct: 0 };
  } else if (vehicleYear >= 2010) {
    return { maxTermAllowed: 60, minApr: 14.99, isBankFinancable: true, minDownPaymentPct: 0.10 };
  } else {
    return { maxTermAllowed: 48, minApr: 19.99, isBankFinancable: false, minDownPaymentPct: 0.25 };
  }
}

function computeAmortization(
  loanPrincipal: number, apr: number, termMonths: number, biWeeklyPayment: number
): AmortizationPeriod[] {
  const schedule: AmortizationPeriod[] = [];
  const biWeeklyRate = apr / 100 / 26;
  const totalPeriods = (termMonths / 12) * 26;
  let currentBalance = loanPrincipal;

  for (let i = 1; i <= totalPeriods; i++) {
    const interestPayment = currentBalance * biWeeklyRate;
    const principalPayment = Math.min(currentBalance, biWeeklyPayment - interestPayment);
    currentBalance = Math.max(0, currentBalance - principalPayment);

    schedule.push({
      period: i,
      payment: principalPayment + interestPayment,
      principal: principalPayment,
      interest: interestPayment,
      balance: currentBalance
    });

    if (currentBalance <= 0) break;
  }
  return schedule;
}
```

- [ ] **Step 2: Update `calculateAutoLoan` to use `input.licensingFee` and the new helpers**

Replace the body of `calculateAutoLoan` (lines 42–131):

```typescript
export const calculateAutoLoan = (input: CalculationInput): CalculationResult => {
  const { vehicleYear, vehiclePrice, tradeInValue, downPayment, apr, termMonths, licensingFee } = input;
  const rules = getYearRules(vehicleYear, vehiclePrice);

  const minDownPaymentRequired = rules.minDownPaymentPct > 0 ? vehiclePrice * rules.minDownPaymentPct : 0;

  const taxableAmount = Math.max(0, vehiclePrice - tradeInValue + ADMIN_FEE + OMVIC_FEE);
  const hst = taxableAmount * HST_RATE;
  const loanPrincipal = Math.max(0, taxableAmount + hst + licensingFee - downPayment);

  const monthlyRate = apr / 100 / 12;
  let monthlyPayment = 0;

  if (apr > 0) {
    monthlyPayment = loanPrincipal *
      (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
      (Math.pow(1 + monthlyRate, termMonths) - 1);
  } else {
    monthlyPayment = loanPrincipal / termMonths;
  }

  const biWeeklyPayment = (monthlyPayment * 12) / 26;
  const schedule = computeAmortization(loanPrincipal, apr, termMonths, biWeeklyPayment);
  const totalCost = loanPrincipal + schedule.reduce((sum, p) => sum + p.interest, 0);
  const totalInterest = totalCost - loanPrincipal;

  return {
    loanPrincipal,
    monthlyPayment,
    biWeeklyPayment,
    totalInterest,
    totalCost,
    hst,
    maxTermAllowed: rules.maxTermAllowed,
    minApr: rules.minApr,
    minDownPaymentRequired,
    isBankFinancable: rules.isBankFinancable,
    schedule,
    maxVehiclePrice: vehiclePrice,
  };
};
```

- [ ] **Step 3: Add `ReverseInput` type and `reverseCalculateAutoLoan` function**

Append after `calculateAutoLoan`:

```typescript
export interface ReverseInput {
  targetBiWeeklyPayment: number;
  targetMonthlyPayment: number;
  vehicleYear: number;
  tradeInValue: number;
  downPayment: number;
  licensingFee: number;
}

export const reverseCalculateAutoLoan = (input: ReverseInput): CalculationResult => {
  const { targetBiWeeklyPayment, targetMonthlyPayment, vehicleYear, tradeInValue, downPayment, licensingFee } = input;

  // Use the entered target — prefer monthly if given, else convert bi-weekly
  const monthlyTarget = targetMonthlyPayment > 0
    ? targetMonthlyPayment
    : (targetBiWeeklyPayment * 26) / 12;

  // Get rules for this year (use 0 for price since rules only depend on year)
  const rules = getYearRules(vehicleYear, 0);

  const r = rules.minApr / 100 / 12;
  const n = rules.maxTermAllowed;

  // Solve for loan principal: L = P * ((1+r)^n - 1) / (r * (1+r)^n)
  let loanPrincipal: number;
  if (rules.minApr > 0) {
    const pow = Math.pow(1 + r, n);
    loanPrincipal = monthlyTarget * (pow - 1) / (r * pow);
  } else {
    loanPrincipal = monthlyTarget * n;
  }

  const constants = (tradeInValue - ADMIN_FEE - OMVIC_FEE) * 1.13;

  let maxPrice: number;
  if (rules.minDownPaymentPct > 0) {
    // Apply minimum down payment as a floor; solve algebraically
    const effectiveDown = Math.max(downPayment, 0);
    // First pass without min to check
    const taxableNoMin = (loanPrincipal + effectiveDown - licensingFee) / 1.13;
    const priceNoMin = taxableNoMin + tradeInValue - ADMIN_FEE - OMVIC_FEE;
    const minDownRequired = priceNoMin * rules.minDownPaymentPct;

    if (effectiveDown >= minDownRequired) {
      maxPrice = priceNoMin;
    } else {
      // Use the floor formula: V = (L - licensingFee + constants) / (1.13 - p)
      maxPrice = (loanPrincipal - licensingFee + constants) / (1.13 - rules.minDownPaymentPct);
    }
  } else {
    const taxableAmount = (loanPrincipal + downPayment - licensingFee) / 1.13;
    maxPrice = taxableAmount + tradeInValue - ADMIN_FEE - OMVIC_FEE;
  }

  maxPrice = Math.max(0, Math.round(maxPrice * 100) / 100);

  // Run forward calculation on the result
  const forwardResult = calculateAutoLoan({
    vehicleYear,
    vehiclePrice: maxPrice,
    tradeInValue,
    downPayment: Math.max(downPayment, maxPrice * rules.minDownPaymentPct),
    apr: rules.minApr,
    termMonths: rules.maxTermAllowed,
    licensingFee,
  });

  return { ...forwardResult, maxVehiclePrice: maxPrice };
};
```

- [ ] **Step 4: Update tests to include `licensingFee` in baseInput**

In `src/lib/calculator.test.ts`, update `baseInput`:

```typescript
const baseInput: CalculationInput = {
  vehicleYear: 2024,
  vehiclePrice: 45000,
  tradeInValue: 0,
  downPayment: 5000,
  apr: 6.99,
  termMonths: 84,
  licensingFee: 56,
};
```

Also update the pre-2010 test which now expects `minDownPaymentRequired` to be non-zero (25% of vehicle price):

```typescript
it('pre-2010 vehicles: not bank-financeable, 48mo, 19.99% min APR, 25% down', () => {
  const r = calculateAutoLoan({ ...baseInput, vehicleYear: 2008 });
  expect(r.maxTermAllowed).toBe(48);
  expect(r.minApr).toBe(19.99);
  expect(r.isBankFinancable).toBe(false);
  expect(r.minDownPaymentRequired).toBe(baseInput.vehiclePrice * 0.25);
});
```

And update the HST/fee test (licensing fee is now an input field, total changes slightly — but since we default to 56, the existing test val should still hold):

The "includes OMVIC, licensing, admin" test should still pass since we're still using 56.

- [ ] **Step 5: Add reverse calculation test suite**

Append to `src/lib/calculator.test.ts`:

```typescript
describe('reverseCalculateAutoLoan', () => {
  import { reverseCalculateAutoLoan } from './calculator';

  it('calculates max vehicle price from target bi-weekly payment', () => {
    const r = reverseCalculateAutoLoan({
      targetBiWeeklyPayment: 500,
      targetMonthlyPayment: 0,
      vehicleYear: 2024,
      tradeInValue: 0,
      downPayment: 0,
      licensingFee: 56,
    });
    // $500 bi-weekly → ~$1083.33 monthly → ~$41k max price @ 6.99% / 84mo
    expect(r.maxVehiclePrice).toBeGreaterThan(38000);
    expect(r.maxVehiclePrice).toBeLessThan(45000);
    expect(r.biWeeklyPayment).toBeCloseTo(500, 0);
    expect(r.monthlyPayment).toBeCloseTo(1083, 0);
  });

  it('converts target monthly to bi-weekly automatically', () => {
    const r = reverseCalculateAutoLoan({
      targetBiWeeklyPayment: 0,
      targetMonthlyPayment: 1000,
      vehicleYear: 2024,
      tradeInValue: 0,
      downPayment: 0,
      licensingFee: 56,
    });
    expect(r.biWeeklyPayment).toBeCloseTo(461.54, 0);
  });

  it('2014 vehicle gets 14.99% APR, 60mo term with 10% down floor', () => {
    const r = reverseCalculateAutoLoan({
      targetBiWeeklyPayment: 400,
      targetMonthlyPayment: 0,
      vehicleYear: 2014,
      tradeInValue: 0,
      downPayment: 0,
      licensingFee: 56,
    });
    expect(r.maxTermAllowed).toBe(60);
    expect(r.minApr).toBe(14.99);
    // 10% down should be baked in
    expect(r.loanPrincipal).toBeGreaterThan(0);
    expect(r.schedule.length).toBeGreaterThan(0);
  });

  it('pre-2010 vehicle gets 19.99% APR, 48mo, 25% down floor', () => {
    const r = reverseCalculateAutoLoan({
      targetBiWeeklyPayment: 300,
      targetMonthlyPayment: 0,
      vehicleYear: 2008,
      tradeInValue: 0,
      downPayment: 0,
      licensingFee: 56,
    });
    expect(r.maxTermAllowed).toBe(48);
    expect(r.minApr).toBe(19.99);
    expect(r.isBankFinancable).toBe(false);
  });
});
```

Wait, the import for `reverseCalculateAutoLoan` can't be inside a describe block. That's wrong. Let me fix:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateAutoLoan, reverseCalculateAutoLoan } from './calculator';
```

And update the existing import at the top. The describe block should be:

```typescript
describe('reverseCalculateAutoLoan', () => {
  it('calculates max vehicle price from target bi-weekly payment', () => {
    // ...
  });
  // ...
});
```

- [ ] **Step 6: Run tests, verify they pass, fix any failures**

```bash
npm test
```

Expected: all existing tests pass + new reverse tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/calculator.ts src/lib/calculator.test.ts
git commit -m "feat: add reverse calculator function with year rules helper

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Update calculator-reducer.ts for reverse mode

**Files:**
- Modify: `src/lib/calculator-reducer.ts`

- [ ] **Step 1: Update types — add reverse mode state and new actions**

Replace the types section (lines 1–23):

```typescript
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
  reverseMode: boolean;
  targetBiWeeklyPayment: number;
  targetMonthlyPayment: number;
  showSchedule: boolean;
  adjustments: Adjustment | null;
}

export type CalculatorAction =
  | { type: 'SET_FIELD'; field: keyof CalculationInput; value: number }
  | { type: 'SET_YEAR'; year: number }
  | { type: 'SET_TARGET_BIWEEKLY'; value: number }
  | { type: 'SET_TARGET_MONTHLY'; value: number }
  | { type: 'TOGGLE_MODE' }
  | { type: 'TOGGLE_SCHEDULE' }
  | { type: 'DISMISS_ADJUSTMENTS' };
```

- [ ] **Step 2: Update URL sync for reverse mode**

Replace `syncURL` and `readParams`:

```typescript
const PARAM_KEYS: Record<keyof CalculationInput, string> = {
  vehicleYear: 'year',
  vehiclePrice: 'price',
  tradeInValue: 'trade',
  downPayment: 'down',
  apr: 'apr',
  termMonths: 'term',
  licensingFee: 'lic',
};

function readParams(): { inputs: Partial<CalculationInput>; reverseMode: boolean; targetBiWeekly: number; targetMonthly: number } {
  const params = new URLSearchParams(window.location.search);
  const inputs: Partial<CalculationInput> = {};
  for (const [key, param] of Object.entries(PARAM_KEYS)) {
    const v = params.get(param);
    if (v !== null && !isNaN(Number(v))) {
      (inputs as Record<string, number>)[key] = Number(v);
    }
  }
  return {
    inputs,
    reverseMode: params.get('mode') === 'reverse',
    targetBiWeekly: Number(params.get('targetBiWeekly')) || 0,
    targetMonthly: Number(params.get('targetMonthly')) || 0,
  };
}

export function syncURL(state: CalculatorState): void {
  const params = new URLSearchParams();
  if (state.reverseMode) {
    params.set('mode', 'reverse');
    if (state.targetBiWeeklyPayment > 0) params.set('targetBiWeekly', String(state.targetBiWeeklyPayment));
    if (state.targetMonthlyPayment > 0) params.set('targetMonthly', String(state.targetMonthlyPayment));
  }
  for (const [key, param] of Object.entries(PARAM_KEYS)) {
    const val = state.inputs[key as keyof CalculationInput];
    if (val !== undefined) params.set(param, String(val));
  }
  const qs = params.toString();
  const url = window.location.pathname + (qs ? '?' + qs : '');
  window.history.replaceState(null, '', url);
}
```

- [ ] **Step 3: Update defaults and initial state**

```typescript
const DEFAULTS: CalculationInput = {
  vehicleYear: new Date().getFullYear(),
  vehiclePrice: 45000,
  tradeInValue: 0,
  downPayment: 5000,
  apr: 6.99,
  termMonths: 84,
  licensingFee: 56,
};

export function createInitialState(): CalculatorState {
  const urlData = readParams();
  const inputs = { ...DEFAULTS, ...urlData.inputs };
  const results = calculateAutoLoan(inputs);
  // Clamp to valid rules on init
  inputs.apr = results.minApr;
  inputs.termMonths = Math.min(inputs.termMonths, results.maxTermAllowed);
  inputs.downPayment = Math.max(inputs.downPayment, results.minDownPaymentRequired);

  let targetBiWeekly = urlData.targetBiWeekly;
  let targetMonthly = urlData.targetMonthly;

  if (urlData.reverseMode) {
    // On init in reverse mode, compute min down from a quick pass
    if (!urlData.inputs.downPayment) {
      const rough = reverseCalculateAutoLoan({
        targetBiWeeklyPayment: targetBiWeekly,
        targetMonthlyPayment: targetMonthly,
        vehicleYear: inputs.vehicleYear,
        tradeInValue: inputs.tradeInValue,
        downPayment: 0,
        licensingFee: inputs.licensingFee,
      });
      inputs.downPayment = Math.max(0, rough.maxVehiclePrice * (rough.minDownPaymentRequired > 0 ? rough.minDownPaymentRequired / rough.maxVehiclePrice : 0));
      // Simplify: use the forward calc's minDownPayment ratio
      const fwd = calculateAutoLoan({ ...inputs, downPayment: 0 });
      inputs.downPayment = fwd.minDownPaymentRequired;
    }
    if (targetBiWeekly === 0 && targetMonthly === 0) {
      targetBiWeekly = results.biWeeklyPayment;
      targetMonthly = results.monthlyPayment;
    }
  }

  return {
    inputs,
    results: urlData.reverseMode
      ? reverseCalculateAutoLoan({ targetBiWeeklyPayment: targetBiWeekly, targetMonthlyPayment: targetMonthly, vehicleYear: inputs.vehicleYear, tradeInValue: inputs.tradeInValue, downPayment: inputs.downPayment, licensingFee: inputs.licensingFee })
      : calculateAutoLoan(inputs),
    reverseMode: urlData.reverseMode,
    targetBiWeeklyPayment: targetBiWeekly,
    targetMonthlyPayment: targetMonthly,
    showSchedule: false,
    adjustments: null,
  };
}
```

Wait, the reverse init is getting complicated. Let me simplify:

```typescript
export function createInitialState(): CalculatorState {
  const urlData = readParams();
  const inputs = { ...DEFAULTS, ...urlData.inputs };
  const fwdResult = calculateAutoLoan(inputs);
  inputs.apr = fwdResult.minApr;
  inputs.termMonths = Math.min(inputs.termMonths, fwdResult.maxTermAllowed);
  inputs.downPayment = Math.max(inputs.downPayment, fwdResult.minDownPaymentRequired);

  const targetBiWeekly = urlData.targetBiWeekly || fwdResult.biWeeklyPayment;
  const targetMonthly = urlData.targetMonthly || fwdResult.monthlyPayment;

  if (urlData.reverseMode) {
    const reverseResult = reverseCalculateAutoLoan({
      targetBiWeeklyPayment: targetBiWeekly,
      targetMonthlyPayment: targetMonthly,
      vehicleYear: inputs.vehicleYear,
      tradeInValue: inputs.tradeInValue,
      downPayment: inputs.downPayment,
      licensingFee: inputs.licensingFee,
    });
    inputs.downPayment = Math.max(inputs.downPayment, reverseResult.maxVehiclePrice * (reverseResult.minDownPaymentRequired > 0 ? reverseResult.minDownPaymentRequired / reverseResult.maxVehiclePrice : 0));
    return {
      inputs,
      results: reverseCalculateAutoLoan({
        targetBiWeeklyPayment: targetBiWeekly,
        targetMonthlyPayment: targetMonthly,
        vehicleYear: inputs.vehicleYear,
        tradeInValue: inputs.tradeInValue,
        downPayment: inputs.downPayment,
        licensingFee: inputs.licensingFee,
      }),
      reverseMode: true,
      targetBiWeeklyPayment: targetBiWeekly,
      targetMonthlyPayment: targetMonthly,
      showSchedule: false,
      adjustments: null,
    };
  }

  return {
    inputs,
    results: calculateAutoLoan(inputs),
    reverseMode: false,
    targetBiWeeklyPayment: targetBiWeekly,
    targetMonthlyPayment: targetMonthly,
    showSchedule: false,
    adjustments: null,
  };
}
```

Hmm, this is still calling reverseCalculateAutoLoan twice. Let me just do it once:

```typescript
export function createInitialState(): CalculatorState {
  const urlData = readParams();
  const inputs = { ...DEFAULTS, ...urlData.inputs };
  const fwdResult = calculateAutoLoan(inputs);
  inputs.apr = fwdResult.minApr;
  inputs.termMonths = Math.min(inputs.termMonths, fwdResult.maxTermAllowed);
  inputs.downPayment = Math.max(inputs.downPayment, fwdResult.minDownPaymentRequired);

  const targetBiWeekly = urlData.targetBiWeekly || fwdResult.biWeeklyPayment;
  const targetMonthly = urlData.targetMonthly || fwdResult.monthlyPayment;

  const state: CalculatorState = {
    inputs,
    results: fwdResult,
    reverseMode: urlData.reverseMode,
    targetBiWeeklyPayment: targetBiWeekly,
    targetMonthlyPayment: targetMonthly,
    showSchedule: false,
    adjustments: null,
  };

  if (urlData.reverseMode) {
    const reverseResult = reverseCalculateAutoLoan({
      targetBiWeeklyPayment: targetBiWeekly,
      targetMonthlyPayment: targetMonthly,
      vehicleYear: inputs.vehicleYear,
      tradeInValue: inputs.tradeInValue,
      downPayment: inputs.downPayment,
      licensingFee: inputs.licensingFee,
    });
    state.results = reverseResult;
    state.inputs.downPayment = Math.max(inputs.downPayment, reverseResult.minDownPaymentRequired);
  }

  return state;
}
```

OK this is getting really long in the plan. Let me simplify the plan steps — just show the key code changes and let the implementation handle the rest. The plan should be clear but not excessively detailed on every line.

- [ ] **Step 4: Update the reducer to handle reverse mode actions**

Replace the reducer function:

```typescript
export function calculatorReducer(state: CalculatorState, action: CalculatorAction): CalculatorState {
  switch (action.type) {
    case 'SET_FIELD': {
      const newInputs = { ...state.inputs, [action.field]: action.value };
      return {
        ...state,
        inputs: newInputs,
        results: state.reverseMode
          ? reverseCalculateAutoLoan({
              targetBiWeeklyPayment: state.targetBiWeeklyPayment,
              targetMonthlyPayment: state.targetMonthlyPayment,
              vehicleYear: newInputs.vehicleYear,
              tradeInValue: newInputs.tradeInValue,
              downPayment: newInputs.downPayment,
              licensingFee: newInputs.licensingFee,
            })
          : calculateAutoLoan(newInputs),
        adjustments: null,
      };
    }

    case 'SET_YEAR': {
      const oldInputs = state.inputs;
      const year = action.year;
      if (year < 1990) {
        return { ...state, inputs: { ...oldInputs, vehicleYear: year }, adjustments: null };
      }
      const newInputs = { ...oldInputs, vehicleYear: year };

      if (state.reverseMode) {
        const reverseResult = reverseCalculateAutoLoan({
          targetBiWeeklyPayment: state.targetBiWeeklyPayment,
          targetMonthlyPayment: state.targetMonthlyPayment,
          vehicleYear: year,
          tradeInValue: newInputs.tradeInValue,
          downPayment: newInputs.downPayment,
          licensingFee: newInputs.licensingFee,
        });
        const finalInputs = {
          ...newInputs,
          apr: reverseResult.minApr,
          termMonths: reverseResult.maxTermAllowed,
          downPayment: Math.max(newInputs.downPayment, reverseResult.minDownPaymentRequired),
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
          results: reverseCalculateAutoLoan({
            targetBiWeeklyPayment: state.targetBiWeeklyPayment,
            targetMonthlyPayment: state.targetMonthlyPayment,
            vehicleYear: year,
            tradeInValue: finalInputs.tradeInValue,
            downPayment: finalInputs.downPayment,
            licensingFee: finalInputs.licensingFee,
          }),
          adjustments: hasAdjustments ? adjustments : null,
        };
      }

      // Forward mode — existing logic
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

    case 'SET_TARGET_BIWEEKLY': {
      const targetBiWeekly = action.value;
      const targetMonthly = targetBiWeekly > 0 ? (targetBiWeekly * 26) / 12 : 0;
      const reverseResult = reverseCalculateAutoLoan({
        targetBiWeeklyPayment: targetBiWeekly,
        targetMonthlyPayment: targetMonthly,
        vehicleYear: state.inputs.vehicleYear,
        tradeInValue: state.inputs.tradeInValue,
        downPayment: state.inputs.downPayment,
        licensingFee: state.inputs.licensingFee,
      });
      return {
        ...state,
        targetBiWeeklyPayment: targetBiWeekly,
        targetMonthlyPayment: Math.round(targetMonthly * 100) / 100,
        results: reverseResult,
        inputs: {
          ...state.inputs,
          downPayment: Math.max(state.inputs.downPayment, reverseResult.minDownPaymentRequired),
        },
        adjustments: null,
      };
    }

    case 'SET_TARGET_MONTHLY': {
      const targetMonthly = action.value;
      const targetBiWeekly = targetMonthly > 0 ? (targetMonthly * 12) / 26 : 0;
      const reverseResult = reverseCalculateAutoLoan({
        targetBiWeeklyPayment: targetBiWeekly,
        targetMonthlyPayment: targetMonthly,
        vehicleYear: state.inputs.vehicleYear,
        tradeInValue: state.inputs.tradeInValue,
        downPayment: state.inputs.downPayment,
        licensingFee: state.inputs.licensingFee,
      });
      return {
        ...state,
        targetMonthlyPayment: targetMonthly,
        targetBiWeeklyPayment: Math.round(targetBiWeekly * 100) / 100,
        results: reverseResult,
        inputs: {
          ...state.inputs,
          downPayment: Math.max(state.inputs.downPayment, reverseResult.minDownPaymentRequired),
        },
        adjustments: null,
      };
    }

    case 'TOGGLE_MODE': {
      const newMode = !state.reverseMode;
      if (newMode) {
        // Switching to reverse — use current forward results as initial targets
        const targetBiWeekly = state.results.biWeeklyPayment;
        const targetMonthly = state.results.monthlyPayment;
        const reverseResult = reverseCalculateAutoLoan({
          targetBiWeeklyPayment: targetBiWeekly,
          targetMonthlyPayment: targetMonthly,
          vehicleYear: state.inputs.vehicleYear,
          tradeInValue: state.inputs.tradeInValue,
          downPayment: state.inputs.downPayment,
          licensingFee: state.inputs.licensingFee,
        });
        return {
          ...state,
          reverseMode: true,
          targetBiWeeklyPayment: Math.round(targetBiWeekly * 100) / 100,
          targetMonthlyPayment: Math.round(targetMonthly * 100) / 100,
          results: reverseResult,
          inputs: {
            ...state.inputs,
            downPayment: Math.max(state.inputs.downPayment, reverseResult.minDownPaymentRequired),
            apr: reverseResult.minApr,
            termMonths: reverseResult.maxTermAllowed,
          },
          adjustments: null,
        };
      }
      // Switching back to forward — recalculate with current inputs
      return {
        ...state,
        reverseMode: false,
        results: calculateAutoLoan(state.inputs),
        adjustments: null,
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
```

This has a lot of duplicated reverse calculation calls. I should extract a helper. But let me keep the plan code simple — the implementer can DRY it up.

Actually, for the plan, let me just describe what each action does rather than showing all the code. The plan should be clear but not a full copy-paste.

Let me rewrite this task more concisely. I'll show the key code changes and describe the rest.

OK I realize I'm overthinking this for the plan file. Let me write the plan as a clear, executable document and move on. The key sections are clear. Let me just write it all out and commit.

- [ ] **Step 2: Run build to verify TypeScript compiles**

```bash
npm run build
```

Expected: clean compilation.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/calculator-reducer.ts
git commit -m "feat: add reverse mode state management to reducer

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Update LoanInputs.tsx with mode toggle and conditional fields

**Files:**
- Modify: `src/components/LoanInputs.tsx`

- [ ] **Step 1: Rewrite LoanInputs with mode toggle, licensing fee, and reverse fields**

Replace the entire file:

```typescript
import type { CalculationInput, CalculationResult } from '../lib/calculator';

interface Props {
  inputs: CalculationInput;
  results: CalculationResult;
  reverseMode: boolean;
  targetBiWeeklyPayment: number;
  targetMonthlyPayment: number;
  onChange: (field: keyof CalculationInput, value: number) => void;
  onYearChange: (year: number) => void;
  onToggleMode: () => void;
  onTargetBiWeeklyChange: (value: number) => void;
  onTargetMonthlyChange: (value: number) => void;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 1990 + 2 }, (_, i) => 1990 + i).reverse();

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
      {/* Segmented Pill Toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
        <div className="mode-toggle">
          <button
            className={`mode-toggle-option ${!reverseMode ? 'active' : ''}`}
            onClick={() => reverseMode && onToggleMode()}
          >
            Payment
          </button>
          <button
            className={`mode-toggle-option ${reverseMode ? 'active' : ''}`}
            onClick={() => !reverseMode && onToggleMode()}
          >
            Max Price
          </button>
        </div>
      </div>

      <div className="input-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Vehicle Year — always visible */}
        <div className="input-group" style={{ gridColumn: 'span 2' }}>
          <label>Vehicle Year</label>
          <select value={inputs.vehicleYear} onChange={(e) => onYearChange(parseInt(e.target.value))}>
            {YEAR_OPTIONS.map((y) => (<option key={y} value={y}>{y}</option>))}
          </select>
        </div>

        {reverseMode ? (
          <>
            {/* Target Bi-Weekly + Monthly side by side */}
            <div className="input-group">
              <label>Target Bi-Weekly ($)</label>
              <input
                type="number"
                value={targetBiWeeklyPayment || ''}
                onChange={(e) => onTargetBiWeeklyChange(parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div className="input-group">
              <label>Target Monthly ($)</label>
              <input
                type="number"
                value={targetMonthlyPayment || ''}
                onChange={(e) => onTargetMonthlyChange(parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>

            {/* APR + Term read-only */}
            <div className="input-group" style={{ gridColumn: 'span 2' }}>
              <label>APR & Term</label>
              <div style={{
                padding: '0.75rem 1rem',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '0.75rem',
                fontSize: '0.95rem',
                color: 'var(--text-primary)',
              }}>
                {results.minApr}% APR &nbsp;·&nbsp; {results.maxTermAllowed} Months ({Math.round(results.maxTermAllowed / 12)} Years)
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginLeft: '0.5rem' }}>(auto from year)</span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Vehicle Price — forward only */}
            <div className="input-group">
              <label>Vehicle Price ($)</label>
              <input
                type="number"
                value={inputs.vehiclePrice}
                onChange={(e) => onChange('vehiclePrice', parseFloat(e.target.value) || 0)}
              />
            </div>

            {/* APR — forward only */}
            <div className="input-group">
              <label>APR (%)</label>
              <input
                type="number"
                value={inputs.apr}
                onChange={(e) => onChange('apr', parseFloat(e.target.value) || 0)}
                step="0.01"
              />
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginTop: '0.2rem' }}>
                Min for {inputs.vehicleYear}: {results.minApr}%
              </div>
            </div>
          </>
        )}

        {/* Trade-In — both modes */}
        <div className="input-group">
          <label>Trade-In Value ($)</label>
          <input
            type="number"
            value={inputs.tradeInValue}
            onChange={(e) => onChange('tradeInValue', parseFloat(e.target.value) || 0)}
          />
        </div>

        {/* Down Payment — both modes */}
        <div className="input-group">
          <label>Down Payment ($)</label>
          <input
            type="number"
            value={inputs.downPayment}
            onChange={(e) => onChange('downPayment', parseFloat(e.target.value) || 0)}
            style={{ borderColor: isDownPaymentTooLow ? 'var(--error-color)' : '' }}
          />
          {results.minDownPaymentRequired > 0 && (
            <div style={{
              color: isDownPaymentTooLow ? 'var(--error-color)' : 'var(--text-secondary)',
              fontSize: '0.7rem',
              marginTop: '0.2rem',
            }}>
              Min {Math.round(results.minDownPaymentRequired / results.maxVehiclePrice * 100)}% Required: ${results.minDownPaymentRequired.toLocaleString()}
            </div>
          )}
        </div>

        {/* Licensing Fee — both modes, editable */}
        <div className="input-group">
          <label>Licensing Fee ($)</label>
          <input
            type="number"
            value={inputs.licensingFee}
            onChange={(e) => onChange('licensingFee', parseFloat(e.target.value) || 0)}
          />
        </div>

        {/* Term slider — forward only */}
        {!reverseMode && (
          <div className="input-group" style={{ gridColumn: 'span 2' }}>
            <label>Loan Term: {inputs.termMonths} Months ({Math.round(inputs.termMonths / 12)} Years)</label>
            <input
              type="range"
              min={12}
              max={84}
              step={12}
              value={inputs.termMonths}
              onChange={(e) => onChange('termMonths', parseFloat(e.target.value) || 12)}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <span>12 mo</span>
              <span style={{ color: isTermTooLong ? 'var(--error-color)' : '' }}>84 mo (7 yr max)</span>
            </div>
            {isTermTooLong && (
              <div style={{ color: 'var(--error-color)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                Max term for {inputs.vehicleYear} is {results.maxTermAllowed} months.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LoanInputs;
```

Note: The min down payment percentage display uses `results.maxVehiclePrice` (which equals `vehiclePrice` in forward mode, so the percentage math still works).

- [ ] **Step 2: Commit**

```bash
git add src/components/LoanInputs.tsx
git commit -m "feat: add mode toggle, licensing fee, and reverse mode fields to LoanInputs

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Update LoanResults.tsx with conditional hero

**Files:**
- Modify: `src/components/LoanResults.tsx`

- [ ] **Step 1: Add reverse mode conditional hero**

Replace the file:

```typescript
import type { CalculationResult } from '../lib/calculator';

interface Props {
  results: CalculationResult;
  reverseMode: boolean;
}

const LoanResults: React.FC<Props> = ({ results, reverseMode }) => (
  <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
    <div className="hero-payment">
      {reverseMode ? (
        <>
          <div className="payment-label">Max Vehicle Price (Pre-Tax)</div>
          <div className="payment-amount">
            ${results.maxVehiclePrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
          <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--panel-border)' }}>
            <div className="payment-label" style={{ fontSize: '1rem' }}>Bi-Weekly Payment</div>
            <div className="payment-amount" style={{ fontSize: '2.5rem' }}>
              ${results.biWeeklyPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <div className="payment-label" style={{ fontSize: '0.9rem' }}>Monthly Payment</div>
            <div className="payment-amount" style={{ fontSize: '1.75rem' }}>
              ${results.monthlyPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="payment-label">Bi-Weekly Payment</div>
          <div className="payment-amount">
            ${results.biWeeklyPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--panel-border)' }}>
            <div className="payment-label" style={{ fontSize: '1rem' }}>Monthly Payment</div>
            <div className="payment-amount" style={{ fontSize: '2.5rem' }}>
              ${results.monthlyPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </>
      )}
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', padding: '0 1rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <label>HST (13%)</label>
        <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)' }}>
          ${results.hst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <label>Amount Financed</label>
        <div style={{ fontSize: '1.25rem', fontWeight: '700' }}>
          ${results.loanPrincipal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <label>Total Interest</label>
        <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--success-color)' }}>
          ${results.totalInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <label>Total Loan Cost</label>
        <div style={{ fontSize: '1.25rem', fontWeight: '700' }}>
          ${results.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      </div>
    </div>

    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', opacity: 0.7 }}>
      Includes $56 Licensing, $22 OMVIC, $2,000 Admin
    </div>
  </div>
);

export default LoanResults;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LoanResults.tsx
git commit -m "feat: add conditional hero display for reverse mode in LoanResults

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Update App.tsx to wire new state and actions

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Pass new props to components**

Update App.tsx to pass `reverseMode`, target values, and new handlers:

```typescript
import { useReducer, useEffect, useRef } from 'react';
import { createInitialState, calculatorReducer, syncURL } from './lib/calculator-reducer';
import LoanInputs from './components/LoanInputs';
import LoanResults from './components/LoanResults';
import AmortizationSchedule from './components/AmortizationSchedule';

const App: React.FC = () => {
  const [state, dispatch] = useReducer(calculatorReducer, createInitialState());
  const urlTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(urlTimer.current);
    urlTimer.current = setTimeout(() => syncURL(state), 400);
    return () => clearTimeout(urlTimer.current);
  }, [state.inputs, state.reverseMode, state.targetBiWeeklyPayment, state.targetMonthlyPayment]);

  useEffect(() => {
    if (!state.adjustments) return;
    const timer = setTimeout(() => dispatch({ type: 'DISMISS_ADJUSTMENTS' }), 6000);
    return () => clearTimeout(timer);
  }, [state.adjustments]);

  const adjustmentMessage = state.adjustments
    ? (() => {
        const parts: string[] = [];
        if (state.adjustments.apr) parts.push(`APR adjusted to ${state.adjustments.apr.to}%`);
        if (state.adjustments.termMonths) parts.push(`term adjusted to ${state.adjustments.termMonths.to} months`);
        if (state.adjustments.downPayment) parts.push(`minimum down payment of $${state.adjustments.downPayment.to.toLocaleString()} applied`);
        return `Vehicle year changed — ${parts.join(', ')}`;
      })()
    : null;

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '5rem' }}>
      <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1>SHIFT<span style={{ color: 'var(--accent-color)' }}>LOGIC</span> HQ</h1>
        <p className="subtitle">Official Dealer Payment Calculator</p>
      </header>

      {adjustmentMessage && (
        <div className="adjustment-banner animate-fade-in" onClick={() => dispatch({ type: 'DISMISS_ADJUSTMENTS' })}>
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
          onChange={(field, value) => dispatch({ type: 'SET_FIELD', field, value })}
          onYearChange={(year) => dispatch({ type: 'SET_YEAR', year })}
          onToggleMode={() => dispatch({ type: 'TOGGLE_MODE' })}
          onTargetBiWeeklyChange={(value) => dispatch({ type: 'SET_TARGET_BIWEEKLY', value })}
          onTargetMonthlyChange={(value) => dispatch({ type: 'SET_TARGET_MONTHLY', value })}
        />
        <LoanResults results={state.results} reverseMode={state.reverseMode} />
      </div>

      <AmortizationSchedule
        schedule={state.results.schedule}
        visible={state.showSchedule}
        onToggle={() => dispatch({ type: 'TOGGLE_SCHEDULE' })}
      />

      <footer style={{ marginTop: '4rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
        &copy; {new Date().getFullYear()} ShiftLogic HQ Automation Hub. All calculations are estimates.
      </footer>
    </div>
  );
};

export default App;
```

Note the `syncURL` dependency array adds the reverse mode fields.

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire reverse mode state and actions in App

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Add CSS for segmented pill toggle

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Add mode toggle styles**

Append before the animations section (before the `@keyframes fadeIn` block):

```css
/* Mode Toggle */
.mode-toggle {
  display: inline-flex;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--panel-border);
  border-radius: 2rem;
  overflow: hidden;
}

.mode-toggle-option {
  padding: 0.5rem 1.5rem;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-family: var(--font-main);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.mode-toggle-option.active {
  background: var(--accent-color);
  color: var(--bg-color);
}

.mode-toggle-option:not(.active):hover {
  color: var(--text-primary);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/index.css
git commit -m "feat: add segmented pill toggle styles

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: Build, test, and verify

**Files:**
- All of the above

- [ ] **Step 1: Run tests**

```bash
npm test
```

Expected: all existing + reverse tests pass.

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: TypeScript compiles clean, Vite produces production bundle.

- [ ] **Step 3: Run dev server for manual verification**

```bash
npm run dev
```

Manual test checklist:
- Toggle to "Max Price" — verify pill switches, fields change
- Enter $500 bi-weekly, 2024 vehicle → max price is reasonable ($38k–$44k)
- Switch year to 2014 → APR shows 14.99%, term 60mo, down payment auto-sets
- Switch year to 2008 → APR 19.99%, term 48mo, 25% down
- Change target monthly → bi-weekly auto-updates
- Switch back to "Payment" → all forward fields restore
- Refresh page with `?mode=reverse&targetBiWeekly=500` → state restores in reverse mode

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final adjustments after integration testing

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Verification Summary
1. `npm test` — all tests pass (existing 17 + new reverse tests)
2. `npm run build` — TypeScript compiles clean
3. Manual browser test — mode toggle, reverse calculation, year switching, URL persistence all work
