<!-- BEGIN public-repo-header -->
<div align="center">

# Fermi-Arena

<a href="https://github.com/blackmath88/fermi-arena"><img alt="Primary language: JavaScript" src="https://img.shields.io/badge/language-JavaScript-526078?style=flat"></a>
<a href="https://github.com/blackmath88/fermi-arena/tree/main/docs"><img alt="Documentation" src="https://img.shields.io/badge/docs-guide-16796f?style=flat"></a>
<a href="https://github.com/blackmath88/fermi-arena/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/blackmath88/fermi-arena?style=flat&amp;color=737373"></a>

</div>
<!-- END public-repo-header -->

Gamified trainer for Fermi / market-sizing interview questions. You build a typed solution tree on a whiteboard; a **mostly deterministic judge** scores it. Models (if used at all) only answer narrow fixed-choice questions — numbers are always scored by code.

UI language: German. Status: **v0.1 starter** — no-AI tier fully playable, local and frontier tiers wired but untested. Style deliberately plain.

## Quick start

```bash
npm run dev      # serves the repo on http://localhost:8080 (python3 http.server)
npm test         # 10 judge/profile tests, Node ≥ 20, no dependencies
npm run build    # → dist/fermi-arena.html (single self-contained file)
```

`dist/fermi-arena.html` opens directly from disk, works offline, and can be published as a Claude Artifact as-is. The dev version (`index.html`) needs a local server because it uses ES modules.

## How a round works

| Phase | Player does |
| --- | --- |
| Klären (30 s) | Picks and writes clarifying questions (scope, unit, time) |
| Struktur (90 s) | Builds the formula tree: factors, units, operations — no numbers |
| Schätzen (120 s) | Fills round values + reason type + one-sentence reason |
| Prüfen (60 s) | Tags factors to reference slots (revealed only now), benchmark or second path, 90 % interval, weakest assumption, "So what?" |
| Urteil | Score 0–100, component bars, per-factor plausibility, truth with source, badges, XP |

Timers are soft: overtime only lowers the speed component.

## The judge in one paragraph

L0 validates inputs. L1 is pure code: accuracy `fp = max(0, 1 − |log10(est/truth)|/3)` (same as allenai/fermi), unit algebra, significant figures, second-path agreement, interval (Winkler score in log space), speed. L2 maps factors to reference slots (self-tagged in the no-AI tier) and checks each value against a plausible log-range. L3 is a binary checklist (reasons, clarification, sanity check, so-what). L4 aggregates with fixed weights; anything uncertain is *deferred* and the weights renormalise. Details and formulas: [`docs/judge.md`](docs/judge.md).

## Three tiers

| Tier | Who answers the closed questions | Status |
| --- | --- | --- |
| Ohne KI | The player, via constrained inputs | Playable, tested |
| Lokal | Ollama model (e.g. Qwen) with JSON-schema enum output | Wired, untested |
| Frontier | Claude API, forced single-option JSON | Wired, untested |

Ratings (Elo per archetype) are stored per tier, so a self-tagged score never mixes with a model-judged one. Settings live under *Einstellungen*.

## Repo layout

```
index.html            dev entry + all CSS
src/units.js          units as dimension vectors (base time = day)
src/tree.js           solution tree + evaluation
src/judge.js          scoring layers L0–L4, weights, badges, feedback
src/tiers.js          signals per tier, closed questions, cache
src/profile.js        XP, levels, streak, Elo, slot bias, calibration
src/app.js            UI
data/problems.js      problem bank
scripts/build.mjs     inlines everything into dist/fermi-arena.html
tests/                node:test suite
docs/concept.json     full concept (schemas, pipeline, tiers, sources, roadmap)
docs/judge.md         formulas and weights
docs/authoring-problems.md   how to add problems
```

## Adding problems

Truth values only from a cited source or derived deterministically from one — never estimated by a model. See [`docs/authoring-problems.md`](docs/authoring-problems.md).

## Prior art and sources

- [allenai/fermi](https://github.com/allenai/fermi) — solutions as programs, fp_score ([paper](https://arxiv.org/abs/2110.14207)). Repo has no LICENSE file: cite, don't redistribute data.
- [FermiEval](https://arxiv.org/html/2510.26995) — interval calibration, Winkler score; LLM 99 % intervals cover only ~65 %.
- [Estimathon](https://estimathon.com/how-to-play) — interval game mechanic.
- [CheckEval](https://arxiv.org/abs/2403.18771) — binary checklists beat Likert for judge agreement.
- [Jev vs. LLMs as Rubric Judges](https://arxiv.org/html/2609.29769v1) — typed classifiers match LLM judges on binary criteria at a fraction of the cost.
- Method: [Hacking the Case Interview](https://www.hackingthecaseinterview.com/pages/consulting-guesstimate-questions), [IGotAnOffer](https://igotanoffer.com/blogs/mckinsey-case-interview-blog/market-sizing), [PrepLounge](https://www.preplounge.com/en/case-interview-basics/market-sizing), [LessWrong](https://www.lesswrong.com/posts/PsEppdvgRisz5xAHG/fermi-estimates).

## Roadmap

1. ✅ No-AI game (this starter)
2. Problem bank to 30, ≥ 20 ranked with fetched truths
3. Run local + frontier tiers live, fix prompts
4. Comparison study: 30 hand-labelled attempts, agreement per question per tier
5. Interval round (Estimathon), challenge mode
6. Style pass
