import { useState, useMemo } from 'react';
import type { AmortizationPeriod } from '../lib/calculator';
import { computeLumpSumAmortization } from '../lib/calculator';

interface Props {
  schedule: AmortizationPeriod[];
  visible: boolean;
  onToggle: () => void;
  loanPrincipal: number;
  apr: number;
  termMonths: number;
  biWeeklyPayment: number;
}

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const AmortizationSchedule: React.FC<Props> = ({
  schedule, visible, onToggle,
  loanPrincipal, apr, termMonths, biWeeklyPayment,
}) => {
  const [extraPayments, setExtraPayments] = useState<Record<number, number>>({});

  const hasAnyExtra = Object.values(extraPayments).some(v => v > 0);

  const lumpSum = useMemo(() => {
    if (!hasAnyExtra) return null;
    return computeLumpSumAmortization(loanPrincipal, apr, termMonths, biWeeklyPayment, extraPayments);
  }, [loanPrincipal, apr, termMonths, biWeeklyPayment, extraPayments, hasAnyExtra]);

  const displaySchedule = lumpSum ? lumpSum.schedule : schedule;

  const handleExtraChange = (period: number, value: number) => {
    setExtraPayments(prev => {
      const next = { ...prev };
      if (value > 0) {
        next[period] = value;
      } else {
        delete next[period];
      }
      return next;
    });
  };

  return (
    <div className="schedule">
      <button type="button" className="btn-line" onClick={onToggle} aria-expanded={visible}>
        {visible ? 'Hide the amortization schedule' : 'See every payment: amortization schedule'}
      </button>

      {visible && (
        <div className="schedule__sheet">
          <p className="schedule__hint">
            Type an amount in the Extra column to see what a lump-sum payment does to the loan.
          </p>
          {lumpSum && (
            <p className="schedule__saved" role="status">
              {lumpSum.periodsSaved} payments saved · ${fmt(lumpSum.interestSaved)} less interest
            </p>
          )}

          <div className="schedule__scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Payment</th>
                  <th scope="col">Principal</th>
                  <th scope="col">Interest</th>
                  <th scope="col">Extra</th>
                  <th scope="col">Balance</th>
                </tr>
              </thead>
              <tbody>
                {displaySchedule.map((row) => (
                  <tr key={row.period}>
                    <td>{row.period}</td>
                    <td>${fmt(row.payment)}</td>
                    <td>${fmt(row.principal)}</td>
                    <td>${fmt(row.interest)}</td>
                    <td>
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={`Extra payment in period ${row.period}`}
                        value={extraPayments[row.period] ? extraPayments[row.period].toLocaleString() : ''}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value.replace(/,/g, '')) || 0;
                          handleExtraChange(row.period, v);
                        }}
                        placeholder="0"
                      />
                    </td>
                    <td>${fmt(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AmortizationSchedule;
