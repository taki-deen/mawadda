import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { CityOption, CountryOption } from '../src/types';

type CityRow = [id: number, name: string, region: string, aliases: string[]];
type Catalog = { countries: Record<string, string>; cities: Record<string, CityRow[]> };

const names = new Intl.DisplayNames(['ar'], { type: 'region', fallback: 'none' });
let catalog: Catalog | undefined;

function locations() {
  catalog ??= JSON.parse(gunzipSync(readFileSync(new URL('../data/locations.json.gz', import.meta.url))).toString('utf8')) as Catalog;
  return catalog;
}

export function countryName(code: string) {
  const english = locations().countries[code];
  return english ? names.of(code) || english : '';
}

export function countryOptions(): CountryOption[] {
  return Object.keys(locations().countries).map(code => ({ code, name: countryName(code) }))
    .sort((first, second) => first.name.localeCompare(second.name, 'ar'));
}

function normalize(text: string) {
  return text.toLowerCase().normalize('NFKD').replace(/[\p{M}ـ]/gu, '')
    .replace(/ى/g, 'ي').replace(/ٱ/g, 'ا').trim();
}

function cityOption([id, name, region]: CityRow): CityOption {
  return { id: String(id), name, region: region === name ? '' : region };
}

export function cityOptions(country: string, query: string) {
  const rows = locations().cities[country] ?? [];
  const term = normalize(query);
  if (!term) return rows.slice(0, 25).map(cityOption);

  const exact: CityRow[] = [];
  const prefix: CityRow[] = [];
  const partial: CityRow[] = [];
  for (const row of rows) {
    const variants = [row[1], ...row[3]].map(normalize);
    if (variants.includes(term)) exact.push(row);
    else if (prefix.length < 25 && variants.some(name => name.startsWith(term))) prefix.push(row);
    else if (partial.length < 25 && variants.some(name => name.includes(term))) partial.push(row);
    if (exact.length === 25) break;
  }
  return [...exact, ...prefix, ...partial].slice(0, 25).map(cityOption);
}

export function findCity(country: string, id: string) {
  const row = locations().cities[country]?.find(city => String(city[0]) === id);
  return row && cityOption(row);
}
