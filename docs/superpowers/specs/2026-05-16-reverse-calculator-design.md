# Reverse Calculator — Design Spec

## Context
The auto loan calculator currently only works forward: enter a vehicle price → get bi-weekly/monthly payments. Customers asking "what can I afford for $500 bi-weekly?" need the reverse: enter a target payment → get the max vehicle price pre-tax.

When the vehicle year changes, the max price and term auto-recalculate using Ontario lender rules (APR minimums, term maximums, down payment minimums).

## UX Design Decisions

### Mode Switching
**Segmented pill toggle** at the top of the input panel: "Payment" | "Max Price". Active side has cyan fill with dark text; inactive is ghosted. Compact, immediately visible, matches the glass-panel aesthetic.

### Forward Mode (unchanged)
Vehicle Year, Vehicle Price, APR, Trade-In Value, Down Payment, Licensing Fee, Term slider.

### Reverse Mode
- **Target Bi-Weekly + Monthly**: two number inputs side by side. Changing one auto-calculates the other (bi-weekly × 26 / 12 = monthly). Both are editable.
- **Vehicle Year**: dropdown (1990–CURRENT_YEAR+1). Changing the year re-runs the reverse calculation and updates APR, term, and down payment minimum.
- **APR + Term**: displayed as a read-only info line ("APR: 14.99% · Term: 60 mo — auto from year"). Not editable in reverse mode.
- **Trade-In Value**: same as forward mode.
- **Down Payment**: pre-populated to the minimum required dollar amount. For years with no minimum (2023+), defaults to $0. User can increase it (higher down = more car), but cannot go below the minimum — it acts as a floor. The minimum amount is computed from a quick initial pass (reverse calc with $0 down → rough max price → min% × rough price).
- **Licensing Fee**: now editable in both modes (default $56).

### Results Panel — Reverse Mode
- **Hero number**: Max Vehicle Price (pre-tax)
- **Secondary**: calculated bi-weekly and monthly payments (should match or be close to the target the user entered)
- **Summary grid**: HST, amount financed, total interest, total cost
- **Amortization schedule**: still available, runs forward calc on the computed max price

## Architecture

### `calculator.ts` — new function
```typescript
reverseCalculateAutoLoan(input: ReverseInput): CalculationResult & { maxVehiclePrice: number }
```

**Math:**
Given target monthly payment `P`, APR `r`, term `n`:
1. `L = P × ((1+r)ⁿ − 1) / (r × (1+r)ⁿ)` — loan principal
2. `taxable = (L + effectiveDown − licensingFee) / 1.13`
3. `maxPrice = taxable + tradeIn − adminFee − omvicFee`

Effective down payment = `max(userDownPayment, minDownPct × maxPrice)`. When the floor applies, solve:
`maxPrice = (L − licensingFee + (tradeIn − adminFee − omvicFee) × 1.13) / (1.13 − minDownPct)`

Reuses existing year → rules mapping (APR, max term, min down %). After computing max price, runs the forward `calculateAutoLoan()` on the result to produce the full schedule.

### `calculator-reducer.ts` — new state + actions
- `CalculatorState` gains: `reverseMode: boolean`, `targetBiWeeklyPayment: number`, `targetMonthlyPayment: number`
- New actions: `TOGGLE_MODE`, `SET_TARGET_BIWEEKLY`, `SET_TARGET_MONTHLY`
- In reverse mode, `SET_YEAR` dispatches `reverseCalculateAutoLoan()` instead of `calculateAutoLoan()`
- `TOGGLE_MODE` switches mode and initializes the other mode's defaults (reverse: pre-populates down payment from quick calc; forward: restores previous values)
- URL sync includes reverse mode params: `?mode=reverse&targetBiWeekly=500&...`

### Components
- **LoanInputs.tsx**: conditional rendering based on `reverseMode` prop. Segmented pill at top. In reverse: target payments replace vehicle price, APR/term are read-only displays, down payment has minimum floor.
- **LoanResults.tsx**: conditional hero based on `reverseMode`. Forward: bi-weekly payment. Reverse: max vehicle price.
- **AmortizationSchedule.tsx**: no changes needed (already driven by `results.schedule`).
- **App.tsx**: passes new props down, wires new action dispatchers.

## Files to modify
- `src/lib/calculator.ts` — add `reverseCalculateAutoLoan`
- `src/lib/calculator.test.ts` — add reverse calculation tests
- `src/lib/calculator-reducer.ts` — reverse mode state + actions
- `src/components/LoanInputs.tsx` — segmented pill + conditional fields
- `src/components/LoanResults.tsx` — conditional hero display
- `src/App.tsx` — wire new state/actions
- `src/index.css` — segmented pill toggle styles

## Verification
1. `npm test` — existing 17 tests pass, add reverse calculation tests
2. `npm run build` — TypeScript compiles clean
3. `npm run dev` — manual test:
   - Toggle to "Max Price", enter $500 bi-weekly, 2024 → verify max price is reasonable
   - Switch year to 2014 → verify APR jumps to 14.99%, term drops to 60mo, down payment auto-sets to 10% of max price
   - Switch year to 2008 → verify APR 19.99%, term 48mo, 25% down
   - Switch back to "Payment" mode → verify all fields restore
   - Refresh page with reverse mode params in URL → verify state restores
