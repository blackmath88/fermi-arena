// Einheiten als Dimensions-Vektoren. Basis: Zeit = Tag.
// Deterministische Einheitenprüfung ohne Bibliothek.

export const DIMS = ['person', 'item', 'event', 'time', 'money', 'volume'];

// key -> { de, dim, toBase }  (toBase: Faktor in Basiseinheit)
export const UNITS = {
  zahl:           { de: 'Zahl (ohne Einheit)',      dim: {},                                   toBase: 1 },
  anteil:         { de: 'Anteil (0–1)',             dim: {},                                   toBase: 1 },
  pers:           { de: 'Personen',                 dim: { person: 1 },                        toBase: 1 },
  stk:            { de: 'Stück',                    dim: { item: 1 },                          toBase: 1 },
  ereig:          { de: 'Ereignisse',               dim: { event: 1 },                         toBase: 1 },
  chf:            { de: 'CHF',                      dim: { money: 1 },                         toBase: 1 },
  tag:            { de: 'Tage',                     dim: { time: 1 },                          toBase: 1 },
  jahr:           { de: 'Jahre',                    dim: { time: 1 },                          toBase: 365 },
  tage_pro_jahr:  { de: 'Tage pro Jahr (Anteil)',   dim: {},                                   toBase: 1 / 365 },
  m3:             { de: 'm³',                       dim: { volume: 1 },                        toBase: 1 },
  m3_stk:         { de: 'm³ pro Stück',             dim: { volume: 1, item: -1 },              toBase: 1 },
  stk_pers:       { de: 'Stück pro Person',         dim: { item: 1, person: -1 },              toBase: 1 },
  stk_pers_tag:   { de: 'Stück pro Person und Tag', dim: { item: 1, person: -1, time: -1 },    toBase: 1 },
  stk_pers_jahr:  { de: 'Stück pro Person und Jahr',dim: { item: 1, person: -1, time: -1 },    toBase: 1 / 365 },
  ereig_pers_tag: { de: 'Ereignisse pro Person und Tag',  dim: { event: 1, person: -1, time: -1 }, toBase: 1 },
  ereig_pers_jahr:{ de: 'Ereignisse pro Person und Jahr', dim: { event: 1, person: -1, time: -1 }, toBase: 1 / 365 },
  stk_tag:        { de: 'Stück pro Tag',            dim: { item: 1, time: -1 },                toBase: 1 },
  stk_jahr:       { de: 'Stück pro Jahr',           dim: { item: 1, time: -1 },                toBase: 1 / 365 },
  pers_tag:       { de: 'Personen pro Tag',         dim: { person: 1, time: -1 },              toBase: 1 },
  chf_stk:        { de: 'CHF pro Stück',            dim: { money: 1, item: -1 },               toBase: 1 },
  chf_jahr:       { de: 'CHF pro Jahr',             dim: { money: 1, time: -1 },               toBase: 1 / 365 },
};

export function dimOf(key) {
  const u = UNITS[key];
  if (!u) throw new Error(`Unbekannte Einheit: ${key}`);
  return normalize(u.dim);
}

export function normalize(dim) {
  const out = {};
  for (const d of DIMS) if (dim[d]) out[d] = dim[d];
  return out;
}

export function mulDim(a, b, sign = 1) {
  const out = {};
  for (const d of DIMS) {
    const v = (a[d] || 0) + sign * (b[d] || 0);
    if (v) out[d] = v;
  }
  return out;
}

export function sameDim(a, b) {
  return DIMS.every(d => (a[d] || 0) === (b[d] || 0));
}

export function dimLabel(dim) {
  const up = [], down = [];
  for (const d of DIMS) {
    const v = dim[d] || 0;
    const s = d + (Math.abs(v) > 1 ? '^' + Math.abs(v) : '');
    if (v > 0) up.push(s); else if (v < 0) down.push(s);
  }
  return (up.join('·') || '1') + (down.length ? ' / ' + down.join('·') : '');
}

export const toBase = (value, key) => value * UNITS[key].toBase;
export const fromBase = (value, key) => value / UNITS[key].toBase;
