import { calculatorReducer, createInitialState, type CalculatorAction } from './calculator-reducer';

/**
 * The worked example shown on the hero message board.
 *
 * It is produced by replaying real calculator actions from a clean state,
 * so the board can never quote a figure the tool below it would not, and
 * "open this example" lands on exactly the numbers that were advertised.
 */
export const EXAMPLE_YEAR = 2023;
export const EXAMPLE_PRICE = 32_000;

/** Price first, so the year change seeds its rate and term for that price. */
export const EXAMPLE_ACTIONS: CalculatorAction[] = [
  { type: 'RESET' },
  { type: 'SET_FIELD', field: 'vehiclePrice', value: EXAMPLE_PRICE },
  { type: 'SET_YEAR', year: EXAMPLE_YEAR },
];

export function exampleDeal() {
  const { inputs, results } = EXAMPLE_ACTIONS.reduce(calculatorReducer, createInitialState());
  return { inputs, results };
}
