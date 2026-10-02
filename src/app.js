// UI – bewusst schlicht (Stil folgt später). Ein Zustand, eine render()-Funktion.

import { PROBLEMS, ARCHETYPES } from '../data/problems.js';
import { UNITS, dimOf, sameDim, fromBase } from './units.js';
import { evaluate, leaves, newLeaf, newOp, OPS, replaceNode, removeNode } from './tree.js';
import { judge, validate, LABELS, WEIGHTS, fmt } from './judge.js';
import { TIERS, buildSignals } from './tiers.js';
import { loadProfile, saveProfile, emptyProfile, applyResult, levelOf, biasNotes, BADGES } from './profile.js';

const PHASES = [
  { id: 'clarify', de: 'Klären', budget: 30 },
  { id: 'structure', de: 'Struktur', budget: 90 },
  { id: 'estimate', de: 'Schätzen', budget: 120 },
  { id: 'check', de: 'Prüfen', budget: 60 },
];
const CLARIFY_TYPES = { scope: 'Umfang / Geografie', unit: 'Einheit / Messgrösse', time: 'Zeitraum' };
const REASON_TYPES = { statistik: 'Statistik / bekannte Zahl', erfahrung: 'Eigene Erfahrung', analogie: 'Analogie', schranke: 'Ober-/Untergrenze' };
const SETTINGS_KEY = 'fermi_arena_settings_v1';

const S = {
  view: 'home', profile: loadProfile(), settings: loadSettings(),
  problem: null, phase: 0, attempt: null, phaseStart: 0, phaseTimes: {}, result: null, gain: null, busy: false, errors: [],
};

function loadSettings() {
  const d = { tier: 'noai', local: { url: 'http://localhost:11434', model: 'qwen2.5:7b' }, frontier: { key: '', model: '' } };
  try { return { ...d, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return d; }
}
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(S.settings)); } catch {} }

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = sel => document.querySelector(sel);
const isRanked = p => p.truth.status === 'verified' || p.truth.status === 'derived';

export function parseNum(s) {
  if (typeof s === 'number') return s;
  let t = String(s || '').trim().toLowerCase().replace(/['’\s]/g, '').replace(',', '.');
  let m = 1;
  for (const [suf, f] of [['mrd', 1e9], ['mio', 1e6], ['k', 1e3], ['%', 0.01]]) if (t.endsWith(suf)) { m = f; t = t.slice(0, -suf.length); break; }
  const v = Number(t);
  return t === '' || !isFinite(v) ? null : v * m;
}

// ---------- Ablauf ----------
function start(problem) {
  S.problem = problem;
  S.attempt = {
    problemId: problem.id, tier: S.settings.tier,
    clarifications: Object.keys(CLARIFY_TYPES).map(type => ({ type, on: false, text: '' })),
    tree: newOp('mul'), second: null, low: null, high: null,
    benchmarkId: '', benchmarkNote: '', weakestId: '', soWhat: { what: '', why: '' }, totalSeconds: 0,
  };
  S.phase = 0; S.phaseTimes = {}; S.phaseStart = Date.now(); S.result = null; S.errors = [];
  S.view = 'play'; render();
}

function nextPhase() {
  const ph = PHASES[S.phase];
  S.phaseTimes[ph.id] = Math.round((Date.now() - S.phaseStart) / 1000);
  S.phaseStart = Date.now();
  if (S.phase < PHASES.length - 1) { S.phase++; S.errors = []; render(); return; }
  submit();
}

async function submit() {
  const a = S.attempt;
  a.clarifications = a.clarifications.map(c => ({ ...c, text: c.on ? c.text : '' }));
  a.totalSeconds = Object.values(S.phaseTimes).reduce((x, y) => x + y, 0);
  S.errors = validate(a);
  if (S.errors.length) { S.phase = 2; render(); return; }
  S.busy = true; render();
  try {
    const signals = await buildSignals(S.settings.tier, a, S.problem, S.settings);
    S.result = judge(a, S.problem, signals);
    const { profile, gained, newBadges } = applyResult(S.profile, S.result, S.problem, S.settings.tier);
    S.profile = profile; saveProfile(profile);
    S.gain = { gained, newBadges };
    S.view = 'verdict';
  } catch (e) { S.errors = ['Bewertung fehlgeschlagen: ' + e.message]; }
  S.busy = false; render();
}

// ---------- Rendering ----------
function render() {
  const app = $('#app');
  app.innerHTML = header() + ({ home, play, verdict, profile: profileView, settings: settingsView }[S.view])();
  if (S.view === 'play') updateLive();
}

function header() {
  const p = S.profile;
  return `<header><button class="link" data-act="home"><b>Fermi-Arena</b></button>
    <span class="meta">${esc(levelOf(p.xp))} · ${p.xp} XP · 🔥 ${p.streak} · ${esc(TIERS[S.settings.tier].de)}</span>
    <nav><button class="link" data-act="profile">Profil</button><button class="link" data-act="settings">Einstellungen</button></nav></header>`;
}

function home() {
  const ranked = PROBLEMS.filter(isRanked);
  const daySeed = Number(new Date().toLocaleDateString('sv-SE').replace(/-/g, ''));
  const daily = ranked[daySeed % ranked.length];
  return `<main>
    <section class="card hero"><h2>Tagesschätzung</h2><p>${esc(daily.prompt)}</p>
      <button class="primary" data-act="start" data-id="${daily.id}">Los geht's</button></section>
    <section><h3>Alle Aufgaben</h3><ul class="list">${PROBLEMS.map(p => `
      <li><button class="row" data-act="start" data-id="${p.id}">
        <span>${esc(p.prompt)}</span>
        <span class="tags"><i>${esc(ARCHETYPES[p.archetype])}</i><i>Stufe ${p.difficulty}</i>${isRanked(p) ? '<i class="ok">Rangliste</i>' : '<i>Training</i>'}${p.tutorial ? '<i>Tutorial</i>' : ''}</span>
      </button></li>`).join('')}</ul></section></main>`;
}

function play() {
  const p = S.problem, a = S.attempt, ph = PHASES[S.phase];
  const steps = PHASES.map((x, i) => `<li class="${i === S.phase ? 'on' : i < S.phase ? 'done' : ''}">${x.de}</li>`).join('');
  let body = '';
  if (ph.id === 'clarify') body = clarifyView(a);
  if (ph.id === 'structure' || ph.id === 'estimate') body = `<p class="hint">${ph.id === 'structure'
      ? 'Baue die Formel: Faktoren benennen, Einheit wählen, Operation festlegen. Noch keine Zahlen.'
      : 'Setze runde Werte ein und begründe jeden in einem Satz.'}</p>
    <div class="board">${nodeView(a.tree, ph.id, 'main')}</div>`;
  if (ph.id === 'check') body = checkView(p, a);
  return `<main>
    <section class="card"><div class="q">${esc(p.prompt)}</div>
      <div class="sub">Antwort in: <b>${esc(UNITS[p.answerUnit].de)}</b> · ${isRanked(p) ? 'Rangliste' : 'Training (keine geprüfte Lösung)'}</div></section>
    <ol class="steps">${steps}</ol>
    <div class="timer">Phase ${esc(ph.de)}: <span id="clock">0</span>s / ${ph.budget}s</div>
    ${body}
    <div class="live" id="live"></div>
    ${S.errors.length ? `<div class="err">${S.errors.map(esc).join('<br>')}</div>` : ''}
    <div class="actions">${S.phase > 0 ? '<button data-act="back">Zurück</button>' : ''}
      <button class="primary" data-act="next" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Bewerte …' : S.phase === PHASES.length - 1 ? 'Abgeben' : 'Weiter'}</button></div>
  </main>`;
}

function clarifyView(a) {
  return `<p class="hint">Was würdest du die Interviewerin zuerst fragen? Wähle und formuliere bis zu drei Klärungen.</p>
    ${a.clarifications.map((c, i) => `<div class="clar">
      <label><input type="checkbox" data-clar-on="${i}" ${c.on ? 'checked' : ''}> ${esc(CLARIFY_TYPES[c.type])}</label>
      ${c.on ? `<input type="text" data-clar-text="${i}" value="${esc(c.text)}" placeholder="z. B. Nur Stadt, ohne Agglomeration?">` : ''}</div>`).join('')}`;
}

function unitSelect(l) {
  return `<select data-id="${l.id}" data-f="unit">${Object.entries(UNITS).map(([k, u]) => `<option value="${k}" ${k === l.unit ? 'selected' : ''}>${esc(u.de)}</option>`).join('')}</select>`;
}

function nodeView(n, mode, treeKey) {
  if (n.kind === 'leaf') {
    const est = mode === 'estimate' || mode === 'full';
    return `<div class="leaf" data-node="${n.id}">
      <div class="lrow"><input type="text" data-id="${n.id}" data-f="label" value="${esc(n.label)}" placeholder="Faktor, z. B. Einwohner Basel">${unitSelect(n)}</div>
      ${est ? `<div class="lrow"><input type="text" inputmode="decimal" data-id="${n.id}" data-f="value" value="${n.value ?? ''}" placeholder="Wert, z. B. 200k">
        <select data-id="${n.id}" data-f="reasonType"><option value="">Begründungsart …</option>${Object.entries(REASON_TYPES).map(([k, v]) => `<option value="${k}" ${k === n.reasonType ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <input type="text" data-id="${n.id}" data-f="reason" value="${esc(n.reason)}" placeholder="Ein Satz: warum diese Grössenordnung?">` : ''}
      <div class="lbtn"><button data-act="split" data-id="${n.id}" data-tree="${treeKey}">aufteilen</button><button data-act="del" data-id="${n.id}" data-tree="${treeKey}">entfernen</button></div>
    </div>`;
  }
  return `<div class="op" data-node="${n.id}">
    <select data-id="${n.id}" data-f="op" data-tree="${treeKey}">${Object.entries(OPS).map(([k, o]) => `<option value="${k}" ${k === n.op ? 'selected' : ''}>${o.de}</option>`).join('')}</select>
    <div class="kids">${n.children.map(c => nodeView(c, mode, treeKey)).join(`<div class="sym">${OPS[n.op].sym}</div>`)}</div>
    <div class="lbtn"><button data-act="addleaf" data-id="${n.id}" data-tree="${treeKey}">+ Faktor</button><button data-act="addop" data-id="${n.id}" data-tree="${treeKey}">+ Teilrechnung</button></div>
  </div>`;
}

function checkView(p, a) {
  const ls = leaves(a.tree);
  const selfTag = TIERS[S.settings.tier].selfTag;
  return `
    ${selfTag ? `<h3>1 · Faktoren zuordnen</h3><p class="hint">Jetzt erst siehst du die Referenzfaktoren. Ordne deine Faktoren zu – ehrlich, das ist deine Selbstprüfung.</p>
      ${ls.map(l => `<div class="tag"><span>${esc(l.label || '–')}</span><select data-id="${l.id}" data-f="slot"><option value="">kein Referenzfaktor</option>${p.slots.map(s => `<option value="${s.id}" ${s.id === l.slot ? 'selected' : ''}>${esc(s.de)}</option>`).join('')}</select></div>`).join('')}` : ''}
    <h3>2 · Plausibilität</h3>
    <select data-a="benchmarkId"><option value="">Referenz wählen …</option>${p.benchmarks.map(b => `<option value="${b.id}" ${b.id === a.benchmarkId ? 'selected' : ''}>${esc(b.de)}</option>`).join('')}</select>
    <input type="text" data-a="benchmarkNote" value="${esc(a.benchmarkNote)}" placeholder="Wie passt dein Ergebnis zu dieser Referenz?">
    ${a.second ? `<div class="board second"><div class="sub">Gegenrechnung</div>${nodeView(a.second, 'full', 'second')}</div><button data-act="nosecond">Gegenrechnung entfernen</button>`
      : '<button data-act="second">+ Gegenrechnung (zweiter Weg)</button>'}
    <h3>3 · Intervall (90 % sicher)</h3>
    <div class="lrow"><input type="text" data-a="low" value="${a.low ?? ''}" placeholder="Untergrenze"><input type="text" data-a="high" value="${a.high ?? ''}" placeholder="Obergrenze"></div>
    <h3>4 · Schwächste Annahme</h3>
    <select data-a="weakestId"><option value="">wählen …</option>${ls.map(l => `<option value="${l.id}" ${l.id === a.weakestId ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}</select>
    <h3>5 · So what?</h3>
    <div class="sowhat">Das heisst: <input type="text" data-sw="what" value="${esc(a.soWhat.what)}" placeholder="z. B. der Markt reicht für 3 Filialen"> weil <input type="text" data-sw="why" value="${esc(a.soWhat.why)}" placeholder="z. B. eine Filiale braucht ~400 Kunden/Tag"></div>`;
}

function updateLive() {
  const el = $('#live'); if (!el) return;
  const p = S.problem, ev = evaluate(S.attempt.tree);
  const ok = sameDim(ev.dim, dimOf(p.answerUnit));
  const v = isFinite(ev.value) ? fmt(fromBase(ev.value, p.answerUnit)) : '–';
  const unitErr = ev.errors.some(e => e.unit);
  const unitTxt = ok && !unitErr ? '<span class="ok">✓ Einheit passt</span>' : '<span class="bad">✗ Einheit passt nicht</span>';
  const phase = PHASES[S.phase].id;
  el.innerHTML = phase === 'clarify' ? ''
    : phase === 'structure' ? `${unitTxt} zu «${esc(UNITS[p.answerUnit].de)}»`
    : `Ergebnis: <b>${v}</b> ${esc(UNITS[p.answerUnit].de)} · ${unitTxt}`;
}

function verdict() {
  const r = S.result, p = S.problem;
  const bars = Object.keys(WEIGHTS).map(k => {
    const v = r.components[k];
    return `<div class="bar"><span>${LABELS[k]}</span><div class="track"><div class="fill" style="width:${v == null ? 0 : Math.round(v * 100)}%"></div></div><span>${v == null ? 'zurückgestellt' : Math.round(v * 100)}</span></div>`;
  }).join('');
  const slotRows = r.perSlot.map(s => {
    const sl = p.slots.find(x => x.id === s.slot);
    return `<tr><td>${esc(sl.de)}</td><td>${fmt(s.value)}</td><td>${fmt(10 ** sl.range[0])}–${fmt(10 ** sl.range[1])}</td><td>${s.score === 1 ? '✓' : Math.round(s.score * 100)}</td></tr>`;
  }).join('');
  return `<main>
    <section class="card hero"><div class="score">${r.total}</div><div>Punkte · +${S.gain.gained} XP</div>
      ${S.gain.newBadges.length ? `<div class="badges">${S.gain.newBadges.map(b => `<span>${esc(BADGES[b])}</span>`).join('')}</div>` : ''}</section>
    <section class="card"><div>Dein Ergebnis: <b>${fmt(r.finalValue)}</b> ${esc(UNITS[p.answerUnit].de)}${r.secondValue != null ? ` · Gegenrechnung: ${fmt(r.secondValue)}` : ''}</div>
      ${r.truth != null ? `<div>Lösung: <b>${fmt(r.truth)}</b> <span class="sub">(${esc(p.truth.derivation || '')} – <a href="${esc(p.truth.source)}" target="_blank" rel="noopener">Quelle</a>)</span></div>`
        : `<div class="sub">Keine geprüfte Lösung (${esc(p.truth.status)}). Treffsicherheit wird nicht bewertet.</div>`}
      ${r.calibration != null ? `<div>Intervall: ${r.hit ? '<span class="ok">Treffer</span>' : '<span class="bad">daneben</span>'} · Kalibrierung ${Math.round(r.calibration * 100)}</div>` : ''}
      ${r.bestTree ? `<div class="sub">Nächste Referenzstruktur: ${esc(r.bestTree.formula)}</div>` : ''}</section>
    <section class="card">${bars}</section>
    ${slotRows ? `<section class="card"><table><tr><th>Faktor</th><th>Dein Wert</th><th>Plausibel</th><th>Score</th></tr>${slotRows}</table></section>` : ''}
    ${r.notes.length ? `<section class="card"><h3>Feedback</h3><ul>${r.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></section>` : ''}
    <div class="actions"><button data-act="start" data-id="${p.id}">Nochmal</button><button class="primary" data-act="home">Nächste Aufgabe</button></div>
  </main>`;
}

function profileView() {
  const p = S.profile;
  const elo = Object.entries(p.elo).map(([k, v]) => { const [t, a] = k.split(':'); return `<tr><td>${esc(TIERS[t]?.de || t)}</td><td>${esc(ARCHETYPES[a] || a)}</td><td>${v}</td></tr>`; }).join('');
  const bias = biasNotes(p, PROBLEMS);
  return `<main>
    <section class="card"><h2>${esc(levelOf(p.xp))}</h2><div>${p.xp} XP · Streak ${p.streak} Tage</div>
      <div>Kalibrierung: ${p.calib.n ? `${p.calib.hits}/${p.calib.n} Intervalle getroffen (${Math.round(100 * p.calib.hits / p.calib.n)} %, Ziel 80–95 %)` : 'noch keine Intervalle'}</div></section>
    <section class="card"><h3>Abzeichen</h3>${Object.keys(p.badges).length ? Object.entries(p.badges).map(([b, n]) => `<span class="pill">${esc(BADGES[b])} ×${n}</span>`).join(' ') : 'Noch keine.'}</section>
    <section class="card"><h3>Rating je Archetyp (getrennt nach Stufe)</h3>${elo ? `<table>${elo}</table>` : 'Noch keine Ranglisten-Runden.'}</section>
    <section class="card"><h3>Deine Muster</h3>${bias.length ? `<ul>${bias.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : 'Ab 3 Runden pro Faktor erscheinen hier deine Verzerrungen.'}</section>
    <section class="card"><h3>Verlauf</h3><ul>${p.history.slice(0, 15).map(h => `<li>${h.at.slice(0, 10)} · ${esc(h.problem)} · ${esc(TIERS[h.tier]?.de || h.tier)} · ${h.total}</li>`).join('')}</ul>
      <button data-act="reset">Profil zurücksetzen</button></section></main>`;
}

function settingsView() {
  const s = S.settings;
  return `<main><section class="card"><h3>Bewertungsstufe</h3>
    ${Object.entries(TIERS).map(([k, t]) => `<label class="radio"><input type="radio" name="tier" value="${k}" ${k === s.tier ? 'checked' : ''}> ${esc(t.de)}${t.experimental ? ' <i>(experimentell)</i>' : ''}</label>`).join('')}
    <p class="hint">Ohne KI: alles deterministisch, du ordnest selbst zu. Lokal/Frontier: ein Modell beantwortet nur geschlossene Fragen; Zahlen bewertet immer der Code. Ratings werden je Stufe getrennt geführt.</p></section>
    <section class="card"><h3>Lokal (Ollama)</h3>
      <input type="text" data-set="local.url" value="${esc(s.local.url)}" placeholder="http://localhost:11434">
      <input type="text" data-set="local.model" value="${esc(s.local.model)}" placeholder="Modellname, z. B. qwen2.5:7b">
      <p class="hint">Ollama mit OLLAMA_ORIGINS=* starten, damit der Browser zugreifen darf.</p></section>
    <section class="card"><h3>Frontier (Claude API)</h3>
      <input type="password" data-set="frontier.key" value="${esc(s.frontier.key)}" placeholder="API-Key (bleibt in diesem Browser)">
      <input type="text" data-set="frontier.model" value="${esc(s.frontier.model)}" placeholder="Modell-ID, z. B. aus docs.claude.com">
    </section></main>`;
}

// ---------- Ereignisse ----------
function findTree(key) { return key === 'second' ? 'second' : 'tree'; }

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, id = b.dataset.id, a = S.attempt, tk = findTree(b.dataset.tree);
  if (act === 'home') { S.view = 'home'; return render(); }
  if (act === 'profile') { S.view = 'profile'; return render(); }
  if (act === 'settings') { S.view = 'settings'; return render(); }
  if (act === 'start') return start(PROBLEMS.find(p => p.id === id));
  if (act === 'next') return nextPhase();
  if (act === 'back') { S.phase--; S.phaseStart = Date.now(); return render(); }
  if (act === 'reset') { if (confirmReset()) { S.profile = emptyProfile(); saveProfile(S.profile); } return render(); }
  if (act === 'second') { a.second = newOp('mul'); return render(); }
  if (act === 'nosecond') { a.second = null; return render(); }
  if (act === 'addleaf') { findNode(a[tk], id).children.push(newLeaf()); return render(); }
  if (act === 'addop') { findNode(a[tk], id).children.push(newOp('mul')); return render(); }
  if (act === 'split') { const leaf = findNode(a[tk], id); a[tk] = replaceNode(a[tk], id, newOp('mul', [leaf, newLeaf()])); return render(); }
  if (act === 'del') { a[tk] = removeNode(a[tk], id); return render(); }
});

let resetArmed = 0;
function confirmReset() { const now = Date.now(); if (now - resetArmed < 3000) return true; resetArmed = now; alertInline('Zum Bestätigen innert 3 Sekunden nochmals klicken.'); return false; }
function alertInline(msg) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; document.body.append(el); setTimeout(() => el.remove(), 2500); }

function findNode(n, id) {
  if (n.id === id) return n;
  if (n.kind === 'op') for (const c of n.children) { const f = findNode(c, id); if (f) return f; }
  return null;
}
function findAny(id) { return findNode(S.attempt.tree, id) || (S.attempt.second && findNode(S.attempt.second, id)); }

function onField(e, structural) {
  const t = e.target, a = S.attempt;
  if (t.dataset.f && t.dataset.id) {
    const n = findAny(t.dataset.id); if (!n) return;
    const f = t.dataset.f;
    n[f] = f === 'value' ? parseNum(t.value) : t.value;
    if (structural && (f === 'op' || f === 'unit')) return render();
    return updateLive();
  }
  if (t.dataset.clarOn != null) { a.clarifications[t.dataset.clarOn].on = t.checked; return render(); }
  if (t.dataset.clarText != null) { a.clarifications[t.dataset.clarText].text = t.value; return; }
  if (t.dataset.a) { a[t.dataset.a] = ['low', 'high'].includes(t.dataset.a) ? parseNum(t.value) : t.value; return; }
  if (t.dataset.sw) { a.soWhat[t.dataset.sw] = t.value; return; }
  if (t.name === 'tier') { S.settings.tier = t.value; saveSettings(); return render(); }
  if (t.dataset.set) { const [grp, key] = t.dataset.set.split('.'); S.settings[grp][key] = t.value.trim(); saveSettings(); }
}
document.addEventListener('input', e => onField(e, false));
document.addEventListener('change', e => onField(e, true));

setInterval(() => { const c = $('#clock'); if (c) c.textContent = Math.round((Date.now() - S.phaseStart) / 1000); }, 1000);

render();
