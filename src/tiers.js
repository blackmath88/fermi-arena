// Drei Stufen, eine Schnittstelle: buildSignals(attempt, problem) → Signale für den Richter.
// Modelle beantworten nur geschlossene Fragen (feste Optionen). Unsicher/Fehler → null (= zurückgestellt).

import { leaves } from './tree.js';
import { UNITS } from './units.js';

const minLen = (s, n) => (s || '').trim().length >= n;

// ---------- Stufe 0: ohne KI ----------
export function noAiSignals(attempt) {
  const byId = Object.fromEntries(leaves(attempt.tree).map(l => [l.id, l]));
  return {
    slotOf: id => byId[id]?.slot || '',
    reasonOk: id => !!(byId[id]?.reasonType && minLen(byId[id].reason, 10)),
    clarifyKinds: () => new Set(attempt.clarifications.filter(c => minLen(c.text, 5)).map(c => c.type)),
    benchmarkOk: () => !!(attempt.benchmarkId && minLen(attempt.benchmarkNote, 10)),
    soWhatOk: () => minLen(attempt.soWhat.what, 10) && minLen(attempt.soWhat.why, 10),
  };
}

// ---------- Geschlossene Fragen (für lokal + Frontier) ----------
export const QUESTIONS = {
  MAP_SLOT: (p, l) => ({
    text: `Aufgabe: ${p.prompt}\nDer Spieler nennt den Faktor «${l.label}» (${UNITS[l.unit].de}). Welchem Referenzfaktor entspricht er?`,
    options: [...p.slots.map(s => s.id), 'keiner'],
    labels: Object.fromEntries(p.slots.map(s => [s.id, s.de])),
  }),
  REASON: (p, l) => ({
    text: `Faktor «${l.label}» = ${l.value} ${UNITS[l.unit].de}. Begründung: «${l.reason}». Ist das eine inhaltliche Begründung für die Grössenordnung?`,
    options: ['begruendet', 'leer_oder_wiederholt', 'unklar'],
  }),
  CLARIFY: (p, text) => ({
    text: `Aufgabe: ${p.prompt}\nKlärungsfrage des Spielers: «${text}». Was klärt sie?`,
    options: ['scope', 'unit', 'time', 'keine'],
  }),
  BENCHMARK: (p, note) => ({
    text: `Aufgabe: ${p.prompt}\nPlausibilitätsnotiz: «${note}». Vergleicht sie das Ergebnis mit einer unabhängigen bekannten Grösse?`,
    options: ['ja', 'nein', 'unklar'],
  }),
  SO_WHAT: (p, s) => ({
    text: `Aufgabe: ${p.prompt}\nSchlussaussage: «Das heisst: ${s.what}, weil ${s.why}». Was tut diese Aussage?`,
    options: ['verknuepft_mit_entscheidung', 'wiederholt_zahl', 'anderes'],
  }),
};

// Gemeinsamer Ablauf für Modell-Stufen. ask(q) → Promise<option|null>
async function modelSignals(attempt, problem, ask) {
  const ls = leaves(attempt.tree);
  const slot = {}, reason = {};
  for (const l of ls) {
    const s = await ask(QUESTIONS.MAP_SLOT(problem, l));
    slot[l.id] = s && s !== 'keiner' ? s : '';
    reason[l.id] = minLen(l.reason, 1) ? mapOpt(await ask(QUESTIONS.REASON(problem, l)), { begruendet: true, leer_oder_wiederholt: false }) : false;
  }
  const kinds = new Set();
  for (const c of attempt.clarifications.filter(c => minLen(c.text, 5))) {
    const k = await ask(QUESTIONS.CLARIFY(problem, c.text));
    if (k && k !== 'keine') kinds.add(k);
  }
  const bench = minLen(attempt.benchmarkNote, 5) ? mapOpt(await ask(QUESTIONS.BENCHMARK(problem, attempt.benchmarkNote)), { ja: true, nein: false }) : false;
  const sw = minLen(attempt.soWhat.what, 3) ? mapOpt(await ask(QUESTIONS.SO_WHAT(problem, attempt.soWhat)), { verknuepft_mit_entscheidung: true, wiederholt_zahl: false, anderes: false }) : false;
  return {
    slotOf: id => slot[id] || '',
    reasonOk: id => reason[id] ?? null,
    clarifyKinds: () => kinds,
    benchmarkOk: () => bench,
    soWhatOk: () => sw,
  };
}
const mapOpt = (opt, m) => (opt != null && opt in m ? m[opt] : null);

// Cache: gleiche Frage → gleiche Antwort (Replays rufen kein Modell erneut auf)
function cached(engine, fn) {
  return async q => {
    const key = 'fa_cache_' + engine + '_' + hash(q.text + '|' + q.options.join(','));
    try { const hit = localStorage.getItem(key); if (hit) return hit === '∅' ? null : hit; } catch {}
    let ans = null;
    try { ans = await fn(q); } catch (e) { console.warn('Klassifikator-Fehler', e); }
    if (!q.options.includes(ans)) ans = null;
    try { localStorage.setItem(key, ans ?? '∅'); } catch {}
    return ans;
  };
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

const SYSTEM = 'Du bist ein Klassifikator. Antworte ausschliesslich mit JSON {"answer": "<option>"} und wähle genau eine der erlaubten Optionen. Keine Erklärung.';
const prompt = q => `${q.text}\n\nErlaubte Optionen: ${q.options.map(o => q.labels?.[o] ? `${o} (${q.labels[o]})` : o).join(', ')}`;

// ---------- Stufe 1: lokal (Ollama, z. B. Qwen) ----------
// Strukturierte Ausgabe via JSON-Schema mit enum → Modell kann nur erlaubte Optionen liefern.
export function ollamaAsk(cfg) {
  return cached('ollama_' + cfg.model, async q => {
    const r = await fetch(cfg.url.replace(/\/$/, '') + '/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model, stream: false, options: { temperature: 0 },
        format: { type: 'object', properties: { answer: { type: 'string', enum: q.options } }, required: ['answer'] },
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt(q) }],
      }),
    });
    const j = await r.json();
    return JSON.parse(j.message.content).answer;
  });
}

// ---------- Stufe 2: Frontier (Anthropic Messages API, direkt aus dem Browser) ----------
// Nur für den persönlichen Prototyp: API-Key liegt im localStorage dieses Browsers.
export function anthropicAsk(cfg) {
  return cached('anthropic_' + cfg.model, async q => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'x-api-key': cfg.key,
        'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: cfg.model, max_tokens: 50, temperature: 0, system: SYSTEM,
        messages: [{ role: 'user', content: prompt(q) }],
      }),
    });
    const j = await r.json();
    const txt = j.content?.[0]?.text || '';
    return JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)).answer;
  });
}

export const TIERS = {
  noai: { de: 'Ohne KI', selfTag: true, ranked: true },
  local: { de: 'Lokal (Ollama)', selfTag: false, ranked: true, experimental: true },
  frontier: { de: 'Frontier (Claude API)', selfTag: false, ranked: true, experimental: true },
};

export async function buildSignals(tier, attempt, problem, settings) {
  if (tier === 'local') return modelSignals(attempt, problem, ollamaAsk(settings.local));
  if (tier === 'frontier') return modelSignals(attempt, problem, anthropicAsk(settings.frontier));
  return noAiSignals(attempt);
}
