import { useEffect, useMemo, useRef, useState } from 'react';
import ArrowBoard from './ArrowBoard';
import DotMatrix from './DotMatrix';
import { exampleDeal, EXAMPLE_PRICE, EXAMPLE_YEAR } from '../lib/example-deal';
import type { NightDrive } from '../hero/nightDrive';

interface Props {
  /** The visitor's own payment once they have entered a price, else null. */
  livePayment: { biWeekly: number; monthly: number } | null;
  onLoadExample: () => void;
  onStartFromBudget: () => void;
}

const money = (n: number) => n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Priced once: it depends only on the calculator's defaults. */
const EXAMPLE = exampleDeal();

const BOARD_COLS = 20;
const BOARD_HOLD_MS = 3600;
/** Matches the `power-on` animation delay on `.hero__board`. */
const BOARD_POWER_ON_MS = 2000;

const Hero: React.FC<Props> = ({ livePayment, onLoadExample, onStartFromBudget }) => {
  const heroRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sceneState, setSceneState] = useState<'loading' | 'live' | 'flat'>('loading');
  const [slide, setSlide] = useState(0);

  const slides = useMemo<string[][]>(() => {
    if (livePayment) {
      return [
        ['YOUR DEAL', `$${money(livePayment.biWeekly)}`, 'BI-WEEKLY'],
        ['YOUR DEAL', `$${money(livePayment.monthly)}`, 'MONTHLY'],
      ];
    }
    return [
      ['EXAMPLE DEAL', `${EXAMPLE_YEAR} USED  $${EXAMPLE_PRICE.toLocaleString('en-CA')}`, `ONTARIO  ${EXAMPLE.inputs.termMonths} MONTHS`],
      ['BI-WEEKLY PAYMENT', `$${money(EXAMPLE.results.biWeeklyPayment)}`, 'TAX + FEES INCLUDED'],
      ['13 PROVINCES', 'AND TERRITORIES', 'HST  GST  PST  QST'],
    ];
  }, [livePayment]);

  // The board only powers on a couple of seconds in, so the first message
  // gets its full hold from that moment rather than from page load.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const lead = setTimeout(() => {
      interval = setInterval(() => setSlide((s) => s + 1), BOARD_HOLD_MS);
    }, BOARD_POWER_ON_MS);
    return () => {
      clearTimeout(lead);
      clearInterval(interval);
    };
  }, []);

  // The 3D scene is a separate chunk so the calculator never waits on it.
  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = heroRef.current;
    if (!canvas || !hero) return;

    let drive: NightDrive | null = null;
    let cancelled = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const onScroll = () => {
      const progress = Math.min(1, window.scrollY / Math.max(1, hero.offsetHeight));
      hero.style.setProperty('--hero-scroll', progress.toFixed(3));
      drive?.setScroll(progress);
    };
    const onPointer = (e: PointerEvent) => {
      const box = hero.getBoundingClientRect();
      drive?.setPointer(((e.clientX - box.left) / box.width) * 2 - 1, ((e.clientY - box.top) / box.height) * 2 - 1);
    };

    Promise.all([import('../hero/nightDrive'), document.fonts.load('800 64px "Overpass Variable"')])
      .then(([module]) => {
        if (cancelled) return;
        drive = module.createNightDrive(canvas, { reducedMotion });
        setSceneState('live');
        onScroll();
      })
      .catch(() => {
        // No WebGL (or the chunk failed): the CSS road underneath stays visible.
        if (!cancelled) setSceneState('flat');
      });

    window.addEventListener('scroll', onScroll, { passive: true });
    hero.addEventListener('pointermove', onPointer);
    return () => {
      cancelled = true;
      window.removeEventListener('scroll', onScroll);
      hero.removeEventListener('pointermove', onPointer);
      drive?.dispose();
    };
  }, []);

  return (
    <header className={`hero hero--${sceneState}`} ref={heroRef}>
      <canvas className="hero__scene" ref={canvasRef} aria-hidden="true" />
      <div className="hero__scrim" aria-hidden="true" />

      <nav className="topbar" aria-label="Sections">
        <a className="wordmark" href="#top">
          <span className="wordmark__mark" aria-hidden="true" />
          <span>Shift<b>Logic</b> HQ</span>
        </a>
        <ul>
          <li><a href="#calculator">Calculator</a></li>
          <li><a href="#whats-counted">What's counted</a></li>
          <li><a href="#lender-limits">Lender limits</a></li>
        </ul>
      </nav>

      <div className="hero__copy">
        <p className="exit-tab">Canadian auto loan calculator</p>
        <h1>
          <span className="hero__line"><span>The real</span></span>
          <span className="hero__line"><span>payment, down</span></span>
          <span className="hero__line"><span>to the cent.</span></span>
        </h1>
        <p className="hero__lede">
          Car payments worked out the way a finance office works them out. Provincial tax, lender and dealer fees,
          luxury tax, negative equity, and the longest term your model year can actually get.
        </p>

        <div className="hero__board">
          <div className="vms">
            <DotMatrix lines={slides[slide % slides.length]} cols={BOARD_COLS} />
          </div>
          {!livePayment && (
            <a className="hero__example" href="#calculator" onClick={onLoadExample}>
              Open this example in the calculator
            </a>
          )}
        </div>

        <div className="hero__actions">
          <a className="btn-exit" href="#calculator">
            Run your numbers
            <span className="btn-exit__arrow" aria-hidden="true" />
          </a>
          <a className="hero__alt" href="#calculator" onClick={onStartFromBudget}>
            or start from a budget
          </a>
        </div>
      </div>

      <ArrowBoard ready={sceneState !== 'loading'} />
    </header>
  );
};

export default Hero;
