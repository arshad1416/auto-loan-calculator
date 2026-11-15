import { getYearRules } from '../lib/calculator';

interface Band {
  from: number;
  to: number;
  maxTerm: number;
  minApr: number;
  minDownPct: number;
  bank: boolean;
}

const NEWEST = new Date().getFullYear() + 1;
/** Everything this old or older shares the last band in getYearRules. */
const OLDEST = 2011;

/** Collapses consecutive model years with identical rules into one row. */
function buildBands(): Band[] {
  const bands: Band[] = [];
  for (let year = NEWEST; year >= OLDEST; year--) {
    const r = getYearRules(year, 'used');
    const last = bands[bands.length - 1];
    if (
      last &&
      last.maxTerm === r.maxTermAllowed &&
      last.minApr === r.minApr &&
      last.minDownPct === r.minDownPaymentPct &&
      last.bank === r.isBankFinancable
    ) {
      last.from = year;
    } else {
      bands.push({
        from: year,
        to: year,
        maxTerm: r.maxTermAllowed,
        minApr: r.minApr,
        minDownPct: r.minDownPaymentPct,
        bank: r.isBankFinancable,
      });
    }
  }
  return bands;
}

const BANDS = buildBands();

function label(band: Band, index: number): string {
  if (index === 0) return `${band.from} and newer`;
  if (index === BANDS.length - 1) return `${band.to} and older`;
  return band.from === band.to ? `${band.from}` : `${band.from} to ${band.to}`;
}

/** The model-year lending rules, set out like a highway distance sign. */
const LenderLimits: React.FC = () => (
  <section className="section lender-limits" id="lender-limits">
    <header className="section__head" data-reveal>
      <p className="exit-tab">Lender limits</p>
      <h2>The older the vehicle, the shorter the road.</h2>
      <p className="section__lede">
        These are the limits the calculator applies the moment you choose a model year. They follow what lenders are
        writing on used vehicles, not what looks good in an ad.
      </p>
    </header>

    <div className="distance-sign retro" data-reveal>
      <table>
        <thead>
          <tr>
            <th scope="col">Model year</th>
            <th scope="col">Longest term</th>
            <th scope="col">Rate floor</th>
            <th scope="col">Minimum down</th>
            <th scope="col">Who lends</th>
          </tr>
        </thead>
        <tbody>
          {BANDS.map((band, i) => (
            <tr key={band.to}>
              <th scope="row">{label(band, i)}</th>
              <td>{band.maxTerm} mo</td>
              <td>{band.minApr.toFixed(2)}%</td>
              <td>{band.minDownPct ? `${Math.round(band.minDownPct * 100)}%` : 'None'}</td>
              <td>{band.bank ? 'Banks' : 'Specialty'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <p className="fineprint">
      Guidelines for used vehicles, read straight from the rules the calculator runs on. The lender's approval is what
      counts.
    </p>
  </section>
);

export default LenderLimits;
