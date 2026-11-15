/**
 * Road signs as plain HTML. The CSS in index.css gives them their sheeting,
 * borders and the pointer-following glint.
 */

interface LimitSignProps {
  caption: string[];
  value: string | number;
  unit: string;
  /** Narrows the numeral for values like 12.95. */
  compact?: boolean;
}

export const LimitSign: React.FC<LimitSignProps> = ({ caption, value, unit, compact }) => (
  <div className={`sign sign--limit retro${compact ? ' sign--limit-compact' : ''}`}>
    {caption.map((line) => (
      <span className="sign__caption" key={line}>{line}</span>
    ))}
    <span className="sign__numeral" key={value}>{value}</span>
    <span className="sign__caption">{unit}</span>
  </div>
);

interface DiamondProps {
  tone: 'yellow' | 'orange';
  lines: string[];
  tab?: string;
}

export const Diamond: React.FC<DiamondProps> = ({ tone, lines, tab }) => (
  <div className={`sign-stack sign-stack--${tone}`}>
    <div className="sign sign--diamond retro">
      <div className="sign__diamond-text">
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
    </div>
    {tab && <div className="sign sign--tab retro">{tab}</div>}
  </div>
);

interface PlateProps {
  tone: 'green' | 'blue' | 'white';
  children: React.ReactNode;
}

export const Plate: React.FC<PlateProps> = ({ tone, children }) => (
  <div className={`sign sign--plate sign--${tone} retro`}>{children}</div>
);
