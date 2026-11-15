import { Diamond, LimitSign, Plate } from './Signs';

/**
 * "What's counted": each rule the calculator applies, posted as the road
 * sign it most resembles. Figures here mirror src/lib/calculator.ts.
 */
const RoadAhead: React.FC = () => (
  <section className="section road-ahead" id="whats-counted">
    <header className="section__head" data-reveal>
      <p className="exit-tab">What's counted</p>
      <h2>Everything that moves the payment is already posted.</h2>
    </header>

    <ol className="signposts">
      <li className="signpost" data-reveal>
        <div className="signpost__sign">
          <Plate tone="green">
            <span className="plate__big">13</span>
            <span className="plate__small">provinces &amp; territories</span>
          </Plate>
        </div>
        <h3>Tax the way each province charges it</h3>
        <p>
          HST, GST, PST and QST are applied by province, on the price after your trade-in. British Columbia's stepped
          PST, from 7% up to 20% on the most expensive vehicles, is built in.
        </p>
      </li>

      <li className="signpost" data-reveal>
        <div className="signpost__sign">
          <LimitSign caption={['Maximum', 'term']} value={96} unit="months" />
        </div>
        <h3>Terms stop where lenders stop</h3>
        <p>
          A 2023 can stretch to 96 months. A 2016 cannot. Pick the model year and the term, the rate floor and the
          minimum down payment all move to what that year can get.
        </p>
      </li>

      <li className="signpost" data-reveal>
        <div className="signpost__sign">
          <Diamond tone="yellow" lines={['Luxury', 'tax']} tab="Over $100,000" />
        </div>
        <h3>Federal luxury tax</h3>
        <p>
          New vehicles over $100,000 pick it up automatically: the lesser of 10% of the price or 20% of the amount
          above $100,000.
        </p>
      </li>

      <li className="signpost" data-reveal>
        <div className="signpost__sign">
          <Diamond tone="orange" lines={['Negative', 'equity']} tab="40% cap" />
        </div>
        <h3>Owing more than the trade is worth</h3>
        <p>
          The shortfall rolls into the loan, up to 40% of the vehicle price. Anything past that is added to the down
          payment you need, and the calculator says so.
        </p>
      </li>

      <li className="signpost" data-reveal>
        <div className="signpost__sign">
          <Plate tone="blue">
            <span className="plate__glyph" aria-hidden="true">$</span>
            <span className="plate__small">budget first</span>
          </Plate>
        </div>
        <h3>Work it backwards</h3>
        <p>
          Enter the bi-weekly or monthly payment you can carry. Max price mode returns the most expensive vehicle that
          payment supports, tax and fees included.
        </p>
      </li>

      <li className="signpost" data-reveal>
        <div className="signpost__sign">
          <Plate tone="white">
            <span className="plate__small">all fees</span>
            <span className="plate__big plate__big--word">in</span>
          </Plate>
        </div>
        <h3>Every fee on the bill of sale</h3>
        <p>
          Licensing, OMVIC, AMVIC and VSA levies, PPSA, lender and dealer admin, warranty and insurance products. PPSA
          and insurance premiums stay untaxed, apart from Quebec's 9% on insurance.
        </p>
      </li>
    </ol>
  </section>
);

export default RoadAhead;
