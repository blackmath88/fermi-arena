// Aufgabenbank. Regel: truth.value nur aus zitierter Quelle oder deterministisch daraus abgeleitet.
// truth.status: 'verified' | 'derived' | 'to_verify' | 'none'  → nur verified/derived sind rangliste-fähig.
// Slots: erwartete Faktoren. range = plausibler Bereich als log10 in der Slot-Einheit.

const WIKI_CH = 'https://en.wikipedia.org/wiki/Demographics_of_Switzerland';

export const PROBLEMS = [
  {
    id: 'geburtstage-ch-heute',
    prompt: 'Wie viele Menschen in der Schweiz haben heute Geburtstag?',
    archetype: 'recurring_consumption',
    difficulty: 1,
    answerUnit: 'pers_tag',
    truth: { value: 24607, status: 'derived', source: WIKI_CH, asOf: '2024-10',
      derivation: '8 981 565 Einwohner (Okt. 2024) ÷ 365 Tage, Geburtstage gleichverteilt' },
    slots: [
      { id: 'pop', de: 'Bevölkerung Schweiz', unit: 'pers', range: [6.9, 7.0], ref: 9e6, segmentable: false },
      { id: 'days', de: 'Tage im Jahr', unit: 'tag', range: [2.55, 2.57], ref: 365, segmentable: false },
    ],
    trees: [
      { id: 't1', approach: 'top_down', slots: ['pop', 'days'], formula: 'Bevölkerung ÷ Tage im Jahr' },
    ],
    benchmarks: [
      { id: 'b1', de: 'Geburten pro Jahr in der Schweiz liegen bei rund 80 000 – Geburtstage sind viel häufiger, weil jede lebende Person einen hat.' },
    ],
    tutorial: true,
  },
  {
    id: 'rentner-ch',
    prompt: 'Wie viele Menschen in der Schweiz sind 65 Jahre oder älter?',
    archetype: 'recurring_consumption',
    difficulty: 1,
    answerUnit: 'pers',
    truth: { value: 1647219, status: 'derived', source: WIKI_CH, asOf: '2024',
      derivation: '8 981 565 × 18,34 % (Altersstruktur 65+)' },
    slots: [
      { id: 'pop', de: 'Bevölkerung Schweiz', unit: 'pers', range: [6.9, 7.0], ref: 9e6, segmentable: false },
      { id: 'share65', de: 'Anteil 65+', unit: 'anteil', range: [-0.85, -0.6], ref: 0.18, segmentable: false },
      { id: 'lifeexp', de: 'Lebenserwartung', unit: 'jahr', range: [1.88, 1.95], ref: 84, segmentable: false },
      { id: 'years65', de: 'Jahre ab 65 bis Lebensende', unit: 'jahr', range: [1.2, 1.35], ref: 19, segmentable: false },
    ],
    trees: [
      { id: 't1', approach: 'top_down', slots: ['pop', 'share65'], formula: 'Bevölkerung × Anteil 65+' },
      { id: 't2', approach: 'stock_flow', slots: ['pop', 'lifeexp', 'years65'], formula: 'Bevölkerung ÷ Lebenserwartung × Jahre ab 65 (Gleichverteilung)' },
    ],
    benchmarks: [
      { id: 'b1', de: 'Bei gleichmässiger Altersverteilung entfällt auf jeden Jahrgang ca. 1/84 der Bevölkerung.' },
    ],
  },
  {
    id: 'kaffee-basel',
    prompt: 'Wie viele Tassen Kaffee werden in der Stadt Basel pro Tag getrunken?',
    archetype: 'recurring_consumption',
    difficulty: 2,
    answerUnit: 'stk_tag',
    truth: { value: null, status: 'to_verify', source: 'Kaffeekonsum pro Kopf CH (z. B. Branchenverband Kaffee) + Bevölkerung Basel-Stadt' },
    slots: [
      { id: 'pop', de: 'Bevölkerung Basel', unit: 'pers', range: [5.2, 5.4], ref: 2e5, segmentable: true },
      { id: 'share_drinkers', de: 'Anteil Kaffeetrinkende', unit: 'anteil', range: [-0.3, -0.05], ref: 0.7, segmentable: false },
      { id: 'cups', de: 'Tassen pro Person und Tag', unit: 'stk_pers_tag', range: [0.2, 0.6], ref: 2.5, segmentable: true },
      { id: 'commuters', de: 'Pendler/Besucher', unit: 'pers', range: [4.6, 5.2], ref: 8e4, segmentable: false },
    ],
    trees: [
      { id: 't1', approach: 'top_down', slots: ['pop', 'share_drinkers', 'cups'], formula: 'Bevölkerung × Anteil Trinkende × Tassen pro Tag' },
      { id: 't2', approach: 'top_down', slots: ['pop', 'commuters', 'share_drinkers', 'cups'], formula: '(Bevölkerung + Pendler) × Anteil × Tassen' },
    ],
    benchmarks: [
      { id: 'b1', de: 'Die Schweiz gehört weltweit zu den Ländern mit dem höchsten Kaffeekonsum pro Kopf (mehrere Tassen pro Trinker und Tag).' },
    ],
  },
  {
    id: 'coiffeure-zuerich',
    prompt: 'Wie viele Coiffeusen und Coiffeure arbeiten in der Stadt Zürich?',
    archetype: 'service_supply',
    difficulty: 2,
    answerUnit: 'pers',
    truth: { value: null, status: 'to_verify', source: 'BFS STATENT (NOGA 96.02) oder Statistik Stadt Zürich' },
    slots: [
      { id: 'pop', de: 'Bevölkerung Zürich', unit: 'pers', range: [5.55, 5.75], ref: 4.3e5, segmentable: true },
      { id: 'cuts', de: 'Haarschnitte pro Person und Jahr', unit: 'ereig_pers_jahr', range: [0.5, 1.2], ref: 8, segmentable: true },
      { id: 'capacity', de: 'Kunden pro Coiffeur und Tag', unit: 'ereig_pers_tag', range: [0.7, 1.2], ref: 10, segmentable: false },
      { id: 'workdays', de: 'Arbeitstage pro Jahr', unit: 'tage_pro_jahr', range: [2.3, 2.42], ref: 230, segmentable: false },
    ],
    trees: [
      { id: 't1', approach: 'bottom_up', slots: ['pop', 'cuts', 'capacity', 'workdays'], formula: 'Bevölkerung × Haarschnitte/Jahr ÷ (Kunden/Tag × Arbeitstage/Jahr)' },
    ],
    benchmarks: [
      { id: 'b1', de: 'In dichten Städten gibt es typischerweise einen Coiffeursalon pro wenige hundert Einwohner.' },
    ],
  },
  {
    id: 'smartphones-ch',
    prompt: 'Wie viele Smartphones werden in der Schweiz pro Jahr verkauft?',
    archetype: 'durable_goods',
    difficulty: 3,
    answerUnit: 'stk_jahr',
    truth: { value: null, status: 'to_verify', source: 'Marktstudien (z. B. GfK/Comparis) – zu recherchieren' },
    slots: [
      { id: 'pop', de: 'Bevölkerung Schweiz', unit: 'pers', range: [6.9, 7.0], ref: 9e6, segmentable: true },
      { id: 'owners', de: 'Smartphones pro Person', unit: 'stk_pers', range: [-0.15, 0.1], ref: 0.95, segmentable: true },
      { id: 'lifetime', de: 'Nutzungsdauer', unit: 'jahr', range: [0.3, 0.6], ref: 3, segmentable: false },
    ],
    trees: [
      { id: 't1', approach: 'stock_flow', slots: ['pop', 'owners', 'lifetime'], formula: 'Bevölkerung × Geräte pro Person ÷ Nutzungsdauer' },
    ],
    benchmarks: [
      { id: 'b1', de: 'Ersatzzyklus von Smartphones liegt typischerweise bei 2–3 Jahren.' },
    ],
  },
  {
    id: 'pingpong-tram',
    prompt: 'Wie viele Tischtennisbälle passen in ein Basler Tram?',
    archetype: 'physical_capacity',
    difficulty: 3,
    answerUnit: 'stk',
    truth: { value: null, status: 'none', source: 'Hypothetisch – nur Training' },
    slots: [
      { id: 'tram_volume', de: 'Innenvolumen Tram', unit: 'm3', range: [2.0, 2.5], ref: 150, segmentable: false },
      { id: 'ball_volume', de: 'Volumen pro Ball', unit: 'm3_stk', range: [-4.6, -4.4], ref: 3.4e-5, segmentable: false },
      { id: 'packing', de: 'Packungsdichte', unit: 'anteil', range: [-0.25, -0.15], ref: 0.64, segmentable: false },
    ],
    trees: [
      { id: 't1', approach: 'dimensional', slots: ['tram_volume', 'ball_volume', 'packing'], formula: 'Innenvolumen ÷ Ballvolumen × Packungsdichte' },
    ],
    benchmarks: [
      { id: 'b1', de: 'Zufällig geschüttete Kugeln füllen etwa 64 % eines Raums.' },
    ],
  },
];

export const ARCHETYPES = {
  recurring_consumption: 'Wiederkehrender Konsum',
  durable_goods: 'Langlebige Güter',
  service_supply: 'Dienstleistungsangebot',
  physical_capacity: 'Physische Kapazität',
  single_site_revenue: 'Umsatz eines Standorts',
  b2b_market: 'B2B-Markt',
};
