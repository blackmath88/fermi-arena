// Richter: reine Funktionen. Gleicher Versuch + gleiche Signale → gleiche Bewertung.
// Signale (signals) kommen aus der gewählten Stufe (tiers.js): ohne KI, lokal, Frontier.

import { evaluate, leaves, ops } from './tree.js';
import { UNITS, dimOf, sameDim, toBase, fromBase } from './units.js';

export const WEIGHTS = {
  structure_coverage: 0.20,
  assumption_plausibility: 0.15,
  accuracy: 0.15,
  justification_rate: 0.10,
  unit_consistency: 0.10,
  sanity_check: 0.08,
  triangulation: 0.05,
  clarification: 0.05,
  so_what: 0.05,
  speed: 0.04,
  precision_hygiene: 0.03,
};

export const LABELS = {
  structure_coverage: 'Struktur',
  assumption_plausibility: 'Annahmen plausibel',
  accuracy: 'Treffsicherheit',
  justification_rate: 'Begründungen',
  unit_consistency: 'Einheiten',
  sanity_check: 'Plausibilitätscheck',
  triangulation: 'Zweiter Weg',
  clarification: 'Klärung',
  so_what: 'So what?',
  speed: 'Tempo',
  precision_hygiene: 'Runden',
  calibration: 'Intervall (90 %)',
};

export const TIME_BUDGET_S = 300;
const ALPHA = 0.1; // 90 %-Intervall

// Kalibrierungs-Score: Winkler-Score im log10-Raum, auf 0..1 abgebildet.
export function winklerLog(low, high, truth, alpha = ALPHA) {
  const L = Math.log10(low), U = Math.log10(high), y = Math.log10(truth);
  return (U - L) + (2 / alpha) * Math.max(0, L - y, y - U);
}

// fp_score nach Kalyan et al. 2021 (allenai/fermi, eval_utils.accuracy_metric)
export function fpScore(estimate, truth) {
  if (!(estimate > 0) || !(truth > 0)) return 0;
  return Math.max(0, 3 - Math.abs(Math.log10(estimate / truth))) / 3;
}

export function sigFigsOk(v) {
  if (!isFinite(v) || v === 0) return true;
  return Number(v.toPrecision(2)) === v;
}

const clamp01 = x => Math.max(0, Math.min(1, x));

export function validate(attempt) {
  const errs = [];
  for (const l of leaves(attempt.tree)) {
    if (!l.label.trim()) errs.push('Jeder Faktor braucht eine Bezeichnung.');
    if (!(l.value > 0)) errs.push(`«${l.label || 'Faktor'}»: Wert muss grösser als 0 sein.`);
  }
  if (attempt.low != null || attempt.high != null) {
    if (!(attempt.low > 0 && attempt.high > attempt.low)) errs.push('Intervall: Untergrenze < Obergrenze, beide > 0.');
  }
  return [...new Set(errs)];
}

export function judge(attempt, problem, signals) {
  const comp = {};
  const notes = [];
  const ev = evaluate(attempt.tree);
  const ansDim = dimOf(problem.answerUnit);
  const dimOk = sameDim(ev.dim, ansDim);
  const innerUnitErr = ev.errors.some(e => e.unit);
  const finalValue = fromBase(ev.value, problem.answerUnit); // in Antwort-Einheit

  // L1 – deterministisch
  comp.unit_consistency = dimOk && !innerUnitErr ? 1 : 0;
  if (!dimOk) notes.push(`Die Einheit deines Ergebnisses passt nicht zu «${UNITS[problem.answerUnit].de}».`);
  if (innerUnitErr) notes.push('Du addierst Grössen mit verschiedenen Einheiten.');

  const truth = problem.truth;
  const ranked = truth.status === 'verified' || truth.status === 'derived';
  comp.accuracy = ranked ? (dimOk ? fpScore(finalValue, truth.value) : 0) : null;

  const ls = leaves(attempt.tree);
  comp.precision_hygiene = ls.length ? ls.filter(l => sigFigsOk(l.value)).length / ls.length : 0;
  if (comp.precision_hygiene < 1) notes.push('Runde stärker: höchstens 2 signifikante Stellen pro Annahme.');

  let secondValue = null;
  if (attempt.second) {
    const ev2 = evaluate(attempt.second);
    if (sameDim(ev2.dim, ansDim) && ev2.value > 0 && ev.value > 0) {
      secondValue = fromBase(ev2.value, problem.answerUnit);
      comp.triangulation = clamp01(1 - Math.abs(Math.log10(ev.value / ev2.value)));
    } else comp.triangulation = 0;
  } else comp.triangulation = 0;

  const secs = attempt.totalSeconds || 0;
  comp.speed = secs > 0 ? Math.min(1, TIME_BUDGET_S / secs) : 1;

  let calibration = null, hit = null;
  if (attempt.low > 0 && attempt.high > attempt.low && ranked) {
    const w = winklerLog(attempt.low, attempt.high, truth.value);
    calibration = clamp01(1 - w / 3);
    hit = truth.value >= attempt.low && truth.value <= attempt.high;
  }

  // L2 – Slot-Zuordnung (Signale) + deterministische Prüfung
  const slotById = Object.fromEntries(problem.slots.map(s => [s.id, s]));
  const tagged = ls.map(l => ({ leaf: l, slot: slotById[signals.slotOf(l.id)] })).filter(t => t.slot);
  const S = new Set(tagged.map(t => t.slot.id));
  let best = null;
  for (const t of problem.trees) {
    const T = new Set(t.slots);
    const inter = [...S].filter(x => T.has(x)).length;
    const jac = inter / new Set([...S, ...T]).size;
    if (!best || jac > best.jac) best = { tree: t, jac, inter, size: T.size };
  }
  if (best && best.jac >= 0.3) comp.structure_coverage = best.inter / best.size;
  else { comp.structure_coverage = null; notes.push('Eigener Ansatz erkannt – Struktur wird über Einheiten und Gegenrechnung bewertet.'); }

  const perSlot = tagged.map(({ leaf, slot }) => {
    const leafDim = dimOf(leaf.unit), slotDim = dimOf(slot.unit);
    if (!sameDim(leafDim, slotDim)) return { leafId: leaf.id, slot: slot.id, score: 0, ratio: null };
    const inSlotUnit = fromBase(toBase(leaf.value, leaf.unit), slot.unit);
    const x = Math.log10(inSlotUnit);
    const dist = x < slot.range[0] ? slot.range[0] - x : x > slot.range[1] ? x - slot.range[1] : 0;
    return { leafId: leaf.id, slot: slot.id, score: clamp01(1 - dist), ratio: x - Math.log10(slot.ref), value: inSlotUnit };
  });
  comp.assumption_plausibility = perSlot.length ? perSlot.reduce((a, p) => a + p.score, 0) / perSlot.length : null;
  for (const p of perSlot) if (p.score < 1 && p.ratio != null)
    notes.push(`«${slotById[p.slot].de}»: ${fmt(p.value)} liegt ausserhalb des plausiblen Bereichs (${fmt(10 ** slotById[p.slot].range[0])}–${fmt(10 ** slotById[p.slot].range[1])}).`);

  const segSlots = problem.slots.filter(s => s.segmentable).map(s => s.id);
  const segmented = ops(attempt.tree).some(o => o.op === 'segment_sum' &&
    leaves(o).some(l => segSlots.includes(signals.slotOf(l.id))));

  // L3 – Checkliste (Signale)
  const reasons = ls.map(l => signals.reasonOk(l.id));
  const knownReasons = reasons.filter(r => r !== null);
  comp.justification_rate = knownReasons.length ? knownReasons.filter(Boolean).length / knownReasons.length : null;
  comp.clarification = signals.clarifyKinds().size / 3;
  const bench = signals.benchmarkOk();
  comp.sanity_check = attempt.second || bench ? 1 : bench === null ? null : 0;
  const sw = signals.soWhatOk();
  comp.so_what = sw === null ? null : sw ? 1 : 0;

  let weakestOk = null;
  const withRatio = perSlot.filter(p => p.ratio != null);
  if (attempt.weakestId && withRatio.length >= 2) {
    const max = Math.max(...withRatio.map(p => Math.abs(p.ratio)));
    const chosen = withRatio.find(p => p.leafId === attempt.weakestId);
    weakestOk = !!chosen && Math.abs(chosen.ratio) >= max - 0.1;
  }

  // L4 – Aggregation
  let sw2 = 0, sum = 0;
  const deferred = [];
  for (const [k, w] of Object.entries(WEIGHTS)) {
    if (comp[k] == null) { deferred.push(k); continue; }
    sw2 += w; sum += w * comp[k];
  }
  const total = sw2 ? Math.round(100 * sum / sw2) : 0;

  const badges = [];
  if (comp.triangulation >= 0.7) badges.push('zwei_wege');
  if (segmented) badges.push('segmentierer');
  if (comp.sanity_check === 1 && comp.accuracy != null && comp.accuracy >= 0.8) badges.push('realist');
  if (weakestOk) badges.push('selbstkritik');

  if (!comp.clarification) notes.push('Starte mit einer Klärungsfrage (Umfang, Einheit oder Zeitraum).');
  if (comp.sanity_check === 0) notes.push('Kein Plausibilitätscheck: rechne einen zweiten Weg oder vergleiche mit einer Referenz.');
  if (comp.so_what === 0) notes.push('Schliesse mit dem «So what?»: Was bedeutet die Zahl für die Entscheidung?');
  if (weakestOk === false) notes.push('Deine schwächste Annahme war eine andere – vergleiche die Abweichungen unten.');

  return {
    total, components: comp, deferred, notes, badges,
    finalValue, secondValue, dimOk, calibration, hit,
    bestTree: best && best.tree, perSlot, weakestOk, segmented,
    truth: ranked ? truth.value : null,
  };
}

export function fmt(v) {
  if (v == null || !isFinite(v)) return '–';
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toLocaleString('de-CH', { maximumSignificantDigits: 3 }) + ' Mrd.';
  if (a >= 1e6) return (v / 1e6).toLocaleString('de-CH', { maximumSignificantDigits: 3 }) + ' Mio.';
  return v.toLocaleString('de-CH', { maximumSignificantDigits: 3 });
}
