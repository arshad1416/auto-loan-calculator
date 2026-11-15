import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Load the runtime only once the hero has settled, so it never competes with the night drive. */
  ready: boolean;
}

type BoardState = 'idle' | 'live' | 'fallback';

const STATE_MACHINE = 'Board';

/**
 * The hero's scroll cue: a sequential arrow board (tools/rive/arrow-board) pointing down to the
 * calculator. Its state machine sequences the chevrons, holds them solid on `hover`, and shows a
 * still lit chevron when `calm` is set for reduced motion. A CSS chevron stands in if the Rive
 * runtime or the file can't load.
 */
const ArrowBoard: React.FC<Props> = ({ ready }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<(on: boolean) => void>(() => {});
  const [state, setState] = useState<BoardState>('idle');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!ready || !canvas) return;

    let cancelled = false;
    let rive: import('@rive-app/canvas-lite').Rive | null = null;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let onMotion: (() => void) | null = null;

    Promise.all([import('@rive-app/canvas-lite'), import('@rive-app/canvas-lite/rive.wasm?url')])
      .then(([runtime, wasm]) => {
        if (cancelled) return;
        // Self-hosted: the CSP allows nothing from a CDN.
        runtime.RuntimeLoader.setWasmUrl(wasm.default);
        const instance = new runtime.Rive({
          src: '/arrow-board.riv',
          canvas,
          stateMachines: STATE_MACHINE,
          autoplay: true,
          layout: new runtime.Layout({ fit: runtime.Fit.Contain, alignment: runtime.Alignment.Center }),
          onLoad: () => {
            if (cancelled) return;
            instance.resizeDrawingSurfaceToCanvas();
            const inputs = instance.stateMachineInputs(STATE_MACHINE) ?? [];
            const calm = inputs.find((i) => i.name === 'calm');
            const hover = inputs.find((i) => i.name === 'hover');
            if (calm) {
              calm.value = motion.matches;
              onMotion = () => {
                calm.value = motion.matches;
              };
              motion.addEventListener('change', onMotion);
            }
            hoverRef.current = (on) => {
              if (hover) hover.value = on;
            };
            setState('live');
          },
          onLoadError: () => {
            if (!cancelled) setState('fallback');
          },
        });
        rive = instance;
      })
      .catch(() => {
        if (!cancelled) setState('fallback');
      });

    return () => {
      cancelled = true;
      if (onMotion) motion.removeEventListener('change', onMotion);
      hoverRef.current = () => {};
      rive?.cleanup();
    };
  }, [ready]);

  const holdOn = () => hoverRef.current(true);
  const holdOff = () => hoverRef.current(false);

  return (
    <a
      className={`arrow-cue arrow-cue--${state}`}
      href="#calculator"
      aria-label="Go to the calculator"
      onPointerEnter={holdOn}
      onPointerLeave={holdOff}
      onPointerDown={holdOn}
      onFocus={holdOn}
      onBlur={holdOff}
    >
      <canvas className="arrow-cue__board" ref={canvasRef} width={240} height={150} aria-hidden="true" />
      <span className="arrow-cue__fallback" aria-hidden="true" />
    </a>
  );
};

export default ArrowBoard;
