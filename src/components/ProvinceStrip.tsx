import { PROVINCES, type ProvinceData } from '../lib/calculator';

const pct = (rate: number) => `${Number((rate * 100).toFixed(3))}%`;

function taxLabel(p: ProvinceData): string {
  if (p.taxType === 'HST') return `HST ${pct(p.pstRate)}`;
  if (p.taxType === 'GST') return `GST ${pct(p.gstRate)}`;
  if (p.code === 'BC') return `GST ${pct(p.gstRate)} + PST 7 to 20%`;
  return `GST ${pct(p.gstRate)} + ${p.code === 'QC' ? 'QST' : 'PST'} ${pct(p.pstRate)}`;
}

const Markers: React.FC<{ hidden?: boolean }> = ({ hidden }) => (
  <ul className="strip__run" aria-hidden={hidden || undefined}>
    {PROVINCES.map((p) => (
      <li className="marker" key={p.code}>
        <span className="marker__shield">{p.code}</span>
        <span className="marker__text">
          <span className="marker__name">{p.name}</span>
          <span className="marker__tax">{taxLabel(p)}</span>
        </span>
      </li>
    ))}
  </ul>
);

/** A rolling line of province markers with the tax each one charges. */
const ProvinceStrip: React.FC = () => (
  <div className="strip" role="group" aria-label="Sales tax by province and territory">
    <div className="strip__track">
      <Markers />
      <Markers hidden />
    </div>
  </div>
);

export default ProvinceStrip;
