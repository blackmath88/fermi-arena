import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fpScore, winklerLog, sigFigsOk, judge, validate } from '../src/judge.js';
import { evaluate } from '../src/tree.js';
import { dimOf, sameDim, fromBase } from '../src/units.js';
import { noAiSignals } from '../src/tiers.js';
import { applyResult, emptyProfile, eloUpdate } from '../src/profile.js';
import { PROBLEMS } from '../data/problems.js';

const P = id => PROBLEMS.find(p => p.id === id);
const leaf = (id, label, value, unit, slot = '', reasonType = 'statistik', reason = 'Bekannte Zahl aus der Statistik') =>
  ({ kind: 'leaf', id, label, value, unit, slot, reasonType, reason });
const op = (id, o, children) => ({ kind: 'op', id, op: o, children });
const attempt = (tree, extra = {}) => ({
  problemId: 'x', tier: 'noai', tree, second: null, low: null, high: null,
  clarifications: [{ type: 'scope', on: true, text: 'Nur ständige Wohnbevölkerung?' }],
  benchmarkId: 'b1', benchmarkNote: 'Viel mehr als Geburten pro Jahr, passt.', weakestId: '',
  soWhat: { what: 'ein Geburtstagsdienst hätte täglich 25k Kunden', why: 'jeder Mensch hat einmal pro Jahr Geburtstag' },
  totalSeconds: 240, ...extra,
});

test('fpScore entspricht allenai accuracy_metric', () => {
  assert.equal(fpScore(1, 1), 1);
  assert.ok(Math.abs(fpScore(10, 1) - 2 / 3) < 1e-12);
  assert.equal(fpScore(1000, 1), 0);
  assert.equal(fpScore(1e-3, 1), 0);
  assert.ok(Math.abs(fpScore(2, 1) - (3 - Math.log10(2)) / 3) < 1e-12);
});

test('Winkler im log-Raum: Treffer = Breite, Fehlschuss bestraft', () => {
  assert.ok(Math.abs(winklerLog(10, 1000, 100) - 2) < 1e-12);
  assert.ok(Math.abs(winklerLog(10, 100, 1000) - (1 + 20)) < 1e-12);
});

test('signifikante Stellen', () => {
  assert.ok(sigFigsOk(9e6)); assert.ok(sigFigsOk(2.5)); assert.ok(!sigFigsOk(8981565));
});

test('Einheiten: Coiffeur-Baum ergibt Personen', () => {
  const t = op('r', 'div', [
    op('a', 'mul', [leaf('l1', 'Einwohner', 4e5, 'pers'), leaf('l2', 'Schnitte', 8, 'ereig_pers_jahr')]),
    op('b', 'mul', [leaf('l3', 'Kunden/Tag', 10, 'ereig_pers_tag'), leaf('l4', 'Arbeitstage', 230, 'tage_pro_jahr')]),
  ]);
  const ev = evaluate(t);
  assert.ok(sameDim(ev.dim, dimOf('pers')));
  assert.ok(Math.abs(fromBase(ev.value, 'pers') - 4e5 * 8 / (10 * 230)) < 1e-6);
});

test('Geburtstage: guter Versuch – deterministisch und hoch', () => {
  const p = P('geburtstage-ch-heute');
  const tree = op('r', 'div', [leaf('a', 'Bevölkerung', 9e6, 'pers', 'pop'), leaf('b', 'Tage', 365, 'tag', 'days')]);
  const at = attempt(tree);
  assert.deepEqual(validate(at), []);
  const r1 = judge(at, p, noAiSignals(at));
  const r2 = judge(at, p, noAiSignals(at));
  assert.deepEqual(r1, r2);
  assert.equal(r1.components.unit_consistency, 1);
  assert.equal(r1.components.structure_coverage, 1);
  assert.equal(r1.components.assumption_plausibility, 1);
  assert.ok(r1.components.accuracy > 0.99);
  assert.ok(r1.total >= 80, `total ${r1.total}`);
});

test('Einheitenfehler wird erkannt und Treffsicherheit = 0', () => {
  const p = P('geburtstage-ch-heute');
  const tree = op('r', 'add', [leaf('a', 'Bevölkerung', 9e6, 'pers', 'pop'), leaf('b', 'Tage', 365, 'tag', 'days')]);
  const r = judge(attempt(tree), p, noAiSignals(attempt(tree)));
  assert.equal(r.components.unit_consistency, 0);
  assert.equal(r.components.accuracy, 0);
});

test('Training-Aufgabe ohne Lösung: accuracy zurückgestellt', () => {
  const p = P('kaffee-basel');
  const tree = op('r', 'mul', [leaf('a', 'Basler', 2e5, 'pers', 'pop'), leaf('b', 'Anteil', 0.7, 'anteil', 'share_drinkers'), leaf('c', 'Tassen', 2.5, 'stk_pers_tag', 'cups')]);
  const r = judge(attempt(tree), p, noAiSignals(attempt(tree)));
  assert.equal(r.components.accuracy, null);
  assert.ok(r.deferred.includes('accuracy'));
  assert.ok(Math.abs(r.finalValue - 350000) < 1e-6);
});

test('Schwächste Annahme wird gegen Referenz geprüft', () => {
  const p = P('kaffee-basel');
  const tree = op('r', 'mul', [leaf('a', 'Basler', 2e5, 'pers', 'pop'), leaf('b', 'Anteil', 0.7, 'anteil', 'share_drinkers'), leaf('c', 'Tassen', 25, 'stk_pers_tag', 'cups')]);
  assert.equal(judge(attempt(tree, { weakestId: 'c' }), p, noAiSignals(attempt(tree))).weakestOk, true);
  assert.equal(judge(attempt(tree, { weakestId: 'a' }), p, noAiSignals(attempt(tree))).weakestOk, false);
});

test('Ohne-KI-Signale: leere Begründung zählt nicht', () => {
  const tree = op('r', 'mul', [leaf('a', 'X', 1, 'zahl', '', 'statistik', 'kurz'), leaf('b', 'Y', 2, 'zahl', '', '', 'Eine ausführliche Begründung')]);
  const s = noAiSignals(attempt(tree));
  assert.equal(s.reasonOk('a'), false);
  assert.equal(s.reasonOk('b'), false);
});

test('Profil: XP, Elo nur bei Ranglisten-Aufgaben', () => {
  const p = P('geburtstage-ch-heute');
  const tree = op('r', 'div', [leaf('a', 'Bevölkerung', 9e6, 'pers', 'pop'), leaf('b', 'Tage', 365, 'tag', 'days')]);
  const r = judge(attempt(tree), p, noAiSignals(attempt(tree)));
  const { profile, gained } = applyResult(emptyProfile(), r, p, 'noai');
  assert.ok(gained >= r.total);
  assert.ok(profile.elo['noai:recurring_consumption'] > 1000);
  const k = P('kaffee-basel');
  const r2 = judge(attempt(tree), k, noAiSignals(attempt(tree)));
  assert.equal(applyResult(emptyProfile(), r2, k, 'noai').profile.elo['noai:recurring_consumption'], undefined);
  assert.ok(eloUpdate(1000, 1, 1) > eloUpdate(1000, 1, 0));
});
