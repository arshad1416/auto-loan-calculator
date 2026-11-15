/**
 * Formats a dollar amount for reading: whole dollars stay whole ("2,000"), anything with cents
 * always shows both digits ("199.50").
 */
export const tidy = (amount: number): string => {
  const cents = Math.round(amount * 100);
  const digits = cents % 100 === 0 ? 0 : 2;
  return (cents / 100).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
};
