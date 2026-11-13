import { useId, useState } from 'react';
import shapes from '../data/country-map.json';
import type { CountryOption } from './types';

const regions = [
  { name: 'العالم', bounds: '0 0 360 150', radius: 1.4 },
  { name: 'الشرق الأوسط', bounds: '204 47 43 35', radius: .8 },
  { name: 'الخليج العربي', bounds: '222 56 19 16', radius: .48 },
  { name: 'بلاد الشام', bounds: '212 50 13 13', radius: .39 },
  { name: 'أفريقيا', bounds: '158 49 79 79', radius: .95 },
  { name: 'أوروبا', bounds: '165 17 65 40', radius: .8 },
  { name: 'آسيا والمحيط الهادئ', bounds: '230 7 130 127', radius: 1.1 },
  { name: 'الأمريكيتان', bounds: '6 5 145 145', radius: 1.1 },
];

export default function CountryMap({ countries, country, onSelect, disabled }: {
  countries: CountryOption[]; country: string; onSelect: (code: string) => void; disabled: boolean;
}) {
  const [region, setRegion] = useState(0);
  const grid = useId();
  const names = new Map(countries.map(item => [item.code, item.name]));
  const { bounds, radius } = regions[region];
  const selectedName = names.get(country);

  return <div className="country-map">
    <label>منطقة الخريطة<select value={region} onChange={event => setRegion(Number(event.target.value))}>
      {regions.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}
    </select></label>
    <svg className="country-map-graphic" viewBox={bounds} aria-hidden="true" focusable="false">
      <defs><pattern id={grid} width="15" height="15" patternUnits="userSpaceOnUse">
        <path className="country-map-grid" d="M15 0H0V15" vectorEffect="non-scaling-stroke" />
      </pattern></defs>
      <rect width="360" height="150" fill={`url(#${grid})`} />
      {shapes.map(({ id, code, path }) => {
        const name = code ? names.get(code) : undefined;
        return <path key={id} d={path} fillRule="evenodd" vectorEffect="non-scaling-stroke" data-country={name ? code : undefined}
          data-selected={code === country} onClick={name && code && !disabled ? () => onSelect(code) : undefined}>
          {name && <title>{name}</title>}
        </path>;
      })}
      {shapes.map(({ id, code, marker }) => {
        const name = code ? names.get(code) : undefined;
        return marker && code && name && <circle key={id} cx={marker[0]} cy={marker[1]} r={radius} vectorEffect="non-scaling-stroke"
          data-country={code} data-selected={code === country} onClick={disabled ? undefined : () => onSelect(code)}><title>{name}</title></circle>;
      })}
    </svg>
    <p role="status" className="country-map-status">{selectedName ? `الدولة المختارة ${selectedName}` : 'اضغط على الدولة أو كبّر المنطقة من القائمة.'}</p>
  </div>;
}
