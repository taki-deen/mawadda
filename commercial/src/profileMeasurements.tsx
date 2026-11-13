import { useState } from 'react';
import malePhoto from './assets/measurement-height-male.png';
import femalePhoto from './assets/measurement-height-female.png';
import scalePhoto from './assets/measurement-scale.jpg';
import { personalLimits, type PersonalDetails, type ProfileGender } from './personalProfile';
import { ProfileChoices, ProfileNumberField } from './profileInputs';

const heightPhotos = { male: malePhoto, female: femalePhoto };
const heightExample = 165;
const weightExample = 65;
const measurementFormat = new Intl.NumberFormat('en', { useGrouping: false, maximumFractionDigits: 2 });

function HeightPreview({ value, gender }: { value?: number; gender: ProfileGender | '' }) {
  const measured = value !== undefined && value >= personalLimits.height.min && value <= personalLimits.height.max;
  const height = measured ? value : heightExample;
  const ceiling = Math.max(220, Math.ceil((height + 10) / 20) * 20);
  const position = (cm: number) => `${cm * 100 / ceiling}%`;
  const models = gender ? [gender] : (['male', 'female'] as const);

  return <div className="height-preview" dir="ltr" aria-hidden="true">
    <div className="height-chart">
      <div className="height-scale">
        {Array.from({ length: ceiling / 10 + 1 }, (_, index) => {
          const cm = index * 10;
          const major = index % 2 === 0;
          return <span className="height-tick" key={cm} data-major={major} style={{ bottom: position(cm) }}>{major ? cm : ''}</span>;
        })}
      </div>
      <div className="height-models" data-example={!measured} style={{ height: position(height) }}>
        {models.map(model => <img key={model} src={heightPhotos[model]} alt="" data-model={model} loading="lazy" />)}
      </div>
      {measured && <div className="height-marker" style={{ bottom: position(height) }}>
        <span dir="rtl">{measurementFormat.format(height)} سم</span>
      </div>}
    </div>
  </div>;
}

export function HeightField({ value, gender }: { value?: number; gender: ProfileGender | '' }) {
  return <ProfileNumberField label="الطول (سم)" name="heightCm" value={value} {...personalLimits.height} emptyValue={heightExample}
    graphic={current => <HeightPreview value={current} gender={gender} />} />;
}

function weightReading(value?: number) {
  const { min, max } = personalLimits.weight;
  return value !== undefined && value >= min && value <= max ? measurementFormat.format(value) : '—';
}

function WeightPreview({ reading, range = false }: { reading: string; range?: boolean }) {
  return <div className="weight-preview" aria-hidden="true">
    <img src={scalePhoto} alt="" width="560" height="560" loading="lazy" />
    <span className="weight-display" data-range={range} dir="ltr"><strong>{reading}</strong><small dir="rtl">كغ</small></span>
  </div>;
}

export function WeightFields({ weight }: { weight?: PersonalDetails['weight'] }) {
  const [mode, setMode] = useState<string>(weight?.mode ?? 'exact');
  const [minimum, setMinimum] = useState(weight?.mode === 'range' ? weight.min : undefined);
  const [maximum, setMaximum] = useState(weight?.mode === 'range' ? weight.max : undefined);
  const reversed = minimum !== undefined && maximum !== undefined && minimum > maximum;
  const rangeReading = reversed || (minimum === undefined && maximum === undefined)
    ? '—' : `${weightReading(minimum)}–${weightReading(maximum)}`;

  return <div className="profile-weight">
    <ProfileChoices label="طريقة إدخال الوزن" name="weightMode" value={mode} onChange={setMode} options={[
      { value: 'exact', label: 'رقم' }, { value: 'range', label: 'نطاق' }, { value: '', label: 'تركه فارغًا' },
    ]} />
    <fieldset hidden={mode !== 'exact'} disabled={mode !== 'exact'}>
      <ProfileNumberField label="الوزن (كغ)" name="weightKg" value={weight?.mode === 'exact' ? weight.kg : undefined}
        {...personalLimits.weight} emptyValue={weightExample} graphic={value => <WeightPreview reading={weightReading(value)} />} />
    </fieldset>
    <fieldset hidden={mode !== 'range'} disabled={mode !== 'range'}>
      <div className="profile-field profile-number">
        <strong className="weight-range-title">نطاق الوزن (كغ)</strong>
        <WeightPreview reading={rangeReading} range />
        {reversed && <p className="small muted weight-range-warning" role="status">خلّي بداية النطاق أقل من نهايته أو مساوية إلها.</p>}
      </div>
      <ProfileNumberField label="الوزن من (كغ)" name="weightMin" value={weight?.mode === 'range' ? weight.min : undefined}
        {...personalLimits.weight} emptyValue={weightExample} onValueChange={setMinimum} required />
      <ProfileNumberField label="الوزن إلى (كغ)" name="weightMax" value={weight?.mode === 'range' ? weight.max : undefined}
        {...personalLimits.weight} emptyValue={weightExample} onValueChange={setMaximum} required />
    </fieldset>
  </div>;
}
