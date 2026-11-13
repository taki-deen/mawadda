import { useState } from 'react';
import { profileLabels, profileOptions, skinTones, type PersonalDetails, type ProfileGender } from './personalProfile';
import { optionalChoices, ProfileChoices, ProfileTextField } from './profileInputs';

const photoSheets = {
  skin: [
    { name: 'skin', tones: ['فاتحة', 'قمحية', 'سمراء', 'داكنة'] },
    { name: 'skin-extra', tones: ['فاتحة جدًا', 'زيتونية فاتحة', 'سمراء ذهبية', 'داكنة جدًا'] },
  ],
  eyes: [
    { name: 'eyes', tones: ['بنّي', 'عسلي', 'أخضر', 'أزرق', 'رمادي'] },
    { name: 'eyes-extra', tones: ['بنّي داكن', 'كهرماني', 'أخضر داكن', 'رمادي مائل للأخضر', 'رمادي مائل للأزرق'] },
  ],
  hair: [{ name: 'hair', tones: ['أسود', 'بنّي', 'أشقر', 'أحمر', 'رمادي', 'أبيض'] }],
};
type PhotoKind = keyof typeof photoSheets;

function appearanceChoices(kind: PhotoKind, values: readonly string[], gender: ProfileGender | '') {
  const rows = gender ? [gender] : ['male', 'female'];
  return optionalChoices(values).map(option => {
    const sheet = photoSheets[kind].find(candidate => candidate.tones.includes(option.value));
    if (!sheet) return option;
    const x = sheet.tones.indexOf(option.value) * 100 / (sheet.tones.length - 1);
    return {
      ...option,
      preview: <span className="appearance-examples" aria-hidden="true">
        {rows.map(row => <span key={row} className="appearance-photo" data-feature={kind} data-sheet={sheet.name} data-model={row}
          style={{ backgroundPosition: `${x}% ${row === 'male' ? 0 : 100}%` }} />)}
      </span>,
    };
  });
}

export function AppearanceFields({ details, gender }: { details: PersonalDetails; gender: ProfileGender | '' }) {
  const description = details.skinTone && !skinTones.some(tone => tone === details.skinTone) ? details.skinTone : undefined;
  const [skinTone, setSkinTone] = useState(description ? 'custom' : details.skinTone ?? '');

  return <>
    <ProfileChoices label={profileLabels.skinTone} name="skinTone" value={skinTone} onChange={setSkinTone}
      options={[...appearanceChoices('skin', skinTones, gender), { value: 'custom', label: 'أكتب وصفًا بنفسي' }]} />
    <fieldset hidden={skinTone !== 'custom'} disabled={skinTone !== 'custom'}>
      <ProfileTextField label="وصف لون البشرة" name="skinToneCustom" value={description} maxLength={60} required />
    </fieldset>
    <ProfileChoices label={profileLabels.eyeColor} name="eyeColor" initialValue={details.eyeColor}
      options={appearanceChoices('eyes', profileOptions.eyeColor, gender)} />
    <ProfileChoices label={profileLabels.hairColor} name="hairColor" initialValue={details.hairColor}
      options={appearanceChoices('hair', profileOptions.hairColor, gender)} />
  </>;
}
