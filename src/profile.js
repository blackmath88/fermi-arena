// Spielerprofil: XP, Level, Streak, Elo je Archetyp und Stufe, Slot-Bias, Kalibrierung.

const KEY = 'fermi_arena_profile_v1';

export const LEVELS = [
  [0, 'Praktikant'], [500, 'Analyst'], [1500, 'Associate'], [3500, 'Manager'], [7000, 'Partner'],
];

export const BADGES = {
  zwei_wege: 'Zwei Wege',
  segmentierer: 'Segmentierer',
  realist: 'Realist',
  selbstkritik: 'Selbstkritik',
  kalibriert: 'Kalibriert',
  so_what: 'So what?',
};

export const emptyProfile = () => ({ xp: 0, streak: 0, lastDay: null, elo: {}, slotBias: {}, calib: { n: 0, hits: 0 }, soWhatRun: 0, badges: {}, history: [] });

export function loadProfile() {
  try { return { ...emptyProfile(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return emptyProfile(); }
}
export function saveProfile(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} }

export const levelOf = xp => LEVELS.filter(([min]) => xp >= min).pop()[1];

export function eloUpdate(r, difficulty, outcome, k = 32) {
  const D = 800 + 150 * difficulty;
  const expected = 1 / (1 + 10 ** ((D - r) / 400));
  return Math.round(r + k * (outcome - expected));
}

const today = () => new Date().toLocaleDateString('sv-SE');

// Wendet ein Ergebnis an. Reine Funktion auf einer Kopie, Rückgabe: { profile, gained, newBadges }
export function applyResult(profile, result, problem, tier) {
  const p = structuredClone(profile);
  const newBadges = [...result.badges];

  for (const s of result.perSlot) if (s.ratio != null) {
    const b = p.slotBias[s.slot] || { n: 0, mean: 0 };
    b.mean = (b.mean * b.n + s.ratio) / (b.n + 1); b.n++;
    p.slotBias[s.slot] = b;
  }
  if (result.hit != null) {
    p.calib.n++; if (result.hit) p.calib.hits++;
    const rate = p.calib.hits / p.calib.n;
    if (p.calib.n >= 10 && rate >= 0.8 && rate <= 0.95) newBadges.push('kalibriert');
  }
  p.soWhatRun = result.components.so_what === 1 ? p.soWhatRun + 1 : 0;
  if (p.soWhatRun >= 5) newBadges.push('so_what');

  if (problem.truth.status === 'verified' || problem.truth.status === 'derived') {
    const key = tier + ':' + problem.archetype;
    p.elo[key] = eloUpdate(p.elo[key] ?? 1000, problem.difficulty, result.total / 100);
  }

  const d = today();
  if (p.lastDay !== d) {
    const y = new Date(Date.now() - 864e5).toLocaleDateString('sv-SE');
    p.streak = p.lastDay === y ? p.streak + 1 : 1;
    p.lastDay = d;
  }
  const unique = [...new Set(newBadges)];
  for (const b of unique) p.badges[b] = (p.badges[b] || 0) + 1;
  const gained = result.total + 10 * unique.length + (p.streak > 1 ? 5 : 0);
  p.xp += gained;
  p.history = [{ at: new Date().toISOString(), problem: problem.id, tier, total: result.total }, ...p.history].slice(0, 200);
  return { profile: p, gained, newBadges: unique };
}

export function biasNotes(profile, problems) {
  const names = {};
  for (const pr of problems) for (const s of pr.slots) names[s.id] = s.de;
  return Object.entries(profile.slotBias).filter(([, b]) => b.n >= 3 && Math.abs(b.mean) >= 0.15)
    .map(([id, b]) => `Du schätzt «${names[id] || id}» im Schnitt ${(10 ** Math.abs(b.mean)).toFixed(1)}× zu ${b.mean > 0 ? 'hoch' : 'tief'} (n=${b.n}).`);
}
