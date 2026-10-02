# Judge – formulas and weights

Implementation: `src/judge.js`. Same attempt + same signals → same scorecard (tested).

## Layers

**L0 – validate** (blocks submission): every factor has a label and a value > 0; interval, if given, has 0 < low < high.

**L1 – pure code**

| Component | Formula |
| --- | --- |
| accuracy | `max(0, 3 − |log10(est/truth)|) / 3` — only if truth status is `verified` or `derived`, else deferred; 0 if the result's unit is wrong |
| unit_consistency | 1 if final dimension = answer dimension and no `+ − Σ` mixes dimensions |
| precision_hygiene | share of factor values with ≤ 2 significant figures |
| triangulation | `clamp(1 − |log10(v1/v2)|)` for a second path, else 0 |
| speed | `min(1, 300 s / total seconds)` |
| calibration (shown, not weighted) | Winkler in log10, α = 0.1: `W = (U−L) + 20·max(0, L−y, y−U)`, score `clamp(1 − W/3)` |

**L2 – slots** (signal: which reference slot a factor is)

- Choose the reference tree with the highest Jaccard overlap between tagged slots and the tree's slots.
- `structure_coverage = |tagged ∩ tree| / |tree|`; if best Jaccard < 0.3 → deferred ("eigener Ansatz").
- `assumption_plausibility` = mean over tagged factors of `clamp(1 − distance of log10(value) to slot range)`; a unit mismatch with the slot scores 0.
- Segmentation (badge only): a `Σ` node containing a factor tagged with a segmentable slot.

**L3 – checklist** (signals; `null` = deferred)

| Component | Rule |
| --- | --- |
| justification_rate | share of factors whose reason is accepted |
| clarification | distinct accepted kinds (scope/unit/time) ÷ 3 |
| sanity_check | 1 if second path or accepted benchmark note |
| so_what | 1 if accepted |
| weakest assumption (badge) | chosen factor has the largest |log10(value/slot ref)| (±0.1) among ≥ 2 tagged factors — checked by code, never by a model |

**L4 – aggregate**: `total = round(100 · Σ wᵢcᵢ / Σ wᵢ)` over non-deferred components.

| Weight | Component |
| --- | --- |
| 0.20 | structure_coverage |
| 0.15 | assumption_plausibility |
| 0.15 | accuracy |
| 0.10 | justification_rate |
| 0.10 | unit_consistency |
| 0.08 | sanity_check |
| 0.05 | triangulation |
| 0.05 | clarification |
| 0.05 | so_what |
| 0.04 | speed |
| 0.03 | precision_hygiene |

Weights mirror interviewer priorities (structure and assumptions above the final number). They are a reasoned start, not fitted.

## Signals per tier (`src/tiers.js`)

| Signal | Ohne KI | Lokal / Frontier |
| --- | --- | --- |
| slotOf | player's tag | `MAP_SLOT` (slots + `keiner`) |
| reasonOk | reason type set and text ≥ 10 chars | `REASON` (`begruendet` / `leer_oder_wiederholt` / `unklar`) |
| clarifyKinds | ticked chips with text ≥ 5 chars | `CLARIFY` per text (`scope` / `unit` / `time` / `keine`) |
| benchmarkOk | benchmark chosen and note ≥ 10 chars | `BENCHMARK` (`ja` / `nein` / `unklar`) |
| soWhatOk | both blanks ≥ 10 chars | `SO_WHAT` (`verknuepft_mit_entscheidung` / …) |

Model answers outside the option list, errors and `unklar` become `null` (deferred). Answers are cached by question hash in localStorage, so replays never re-call a model.

## Progression (`src/profile.js`)

- XP = total + 10 per badge + 5 streak bonus. Levels: Praktikant 0, Analyst 500, Associate 1500, Manager 3500, Partner 7000.
- Elo per `tier:archetype`, ranked problems only: `expected = 1/(1+10^((D−R)/400))`, `D = 800 + 150·difficulty`, `K = 32`, outcome = total/100.
- Slot bias: running mean of `log10(value/slot ref)`; reported from n ≥ 3 and |mean| ≥ 0.15.
- Badge *Kalibriert*: ≥ 10 intervals with hit rate 80–95 %.
