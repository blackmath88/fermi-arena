# Authoring problems

Problems live in `data/problems.js`. Run `npm test` and `npm run build` after editing.

## Rules

1. **Truth from a source, never from a model.** Models score only ~0.5 fp on Fermi problems themselves.
   - `verified`: value copied from a fetched source (`source` = URL, `asOf` = date).
   - `derived`: computed deterministically from verified inputs; write the formula in `derivation`.
   - `to_verify`: playable in training; no accuracy score, no Elo.
   - `none`: hypothetical (e.g. ping-pong balls in a tram); training only.
2. **Several reference trees** if there are several sensible approaches. Each tree is a set of slot ids plus a display formula.
3. **Slot ranges are generous.** `range` is `[log10 low, log10 high]` in the slot's unit; aim for roughly what a well-informed interviewer would accept without pushback.
4. **Units must close.** Check that the reference tree's units multiply out to `answerUnit` (see the coiffeur test in `tests/judge.test.mjs` for the pattern). Missing unit? Add it to `src/units.js` with its dimension vector and `toBase` (base time = day).
5. **One or two benchmarks** a strong candidate could cite in the sanity check.

## Template

```js
{
  id: 'kebab-case-id',
  prompt: 'Wie viele … ?',
  archetype: 'recurring_consumption', // see ARCHETYPES
  difficulty: 2,                      // 1–5, feeds Elo
  answerUnit: 'pers',                 // key from src/units.js
  truth: { value: 123, status: 'verified', source: 'https://…', asOf: '2025' },
  slots: [
    { id: 'pop', de: 'Bevölkerung', unit: 'pers', range: [6.9, 7.0], ref: 9e6, segmentable: true },
  ],
  trees: [ { id: 't1', approach: 'top_down', slots: ['pop'], formula: 'Bevölkerung × …' } ],
  benchmarks: [ { id: 'b1', de: 'Bekannte Vergleichsgrösse …' } ],
}
```

## Current bank

| id | archetype | truth |
| --- | --- | --- |
| geburtstage-ch-heute | recurring_consumption | derived (Wikipedia, population Oct 2024) |
| rentner-ch | recurring_consumption | derived (Wikipedia, 65+ share) |
| kaffee-basel | recurring_consumption | to_verify |
| coiffeure-zuerich | service_supply | to_verify (BFS STATENT) |
| smartphones-ch | durable_goods | to_verify |
| pingpong-tram | physical_capacity | none |
