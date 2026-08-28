# AX Evals Roadmap

> Living tracker: the "AX Evals Roadmap" artifact (published from this doc; ask in
> session for the link). This file stays the in-repo source for agents.

## atmn v3 changes the target (PRD: lh1bwlqoexqv.postplan.dev, feat/atmn-v3)

The CLI is being rebuilt as a renderer over catalogV2. Build all NEW eval fixtures
against the v3 model, not v2:

- **Config = data.** `autumn.config.ts` executes (bun subprocess) and emits ONE wire
  document — a superset of catalogV2 `UpdateCatalogParams`, API casing verbatim.
  Default export `atmn({ features, plans, history, rewards, referral_programs })`;
  active-vs-history = array membership; full non-archived version history is
  mandatory in code; versioning = code motion (row moves to history, slug bumps).
- **Push = promptless PUT** (`skip_deletions: false`, key presence = management,
  absence = removal proposal). Server derives every decision by row-matching
  (internal_id primary, composite fallback). No flags, no prompts — CI-first.
- **Grading seam becomes the designed contract**: execute config → wire JSON on
  stdout → assert; `catalogV2.preview_update` (params ≡ update) is the server-side
  grader. Our current `transformPlanToApi` grading is a stopgap to swap out.
- **`atmn sandbox create`** mints isolated sandboxes per agent — the eval-org
  isolation primitive, built in.
- **Newly config-expressible** (were B5 blockers): version rows/history, variants
  (nested under base, overlay customize), licenses[], pooled, display, processors
  mappings (the one PATCH-style exception), proration (schema-enforced server-side).
  `event_names` is deprecated — drop from fixtures.
- **New conduct/knowledge case families**: static-fixtures-only rule (no .map/
  spreads), internal_id preservation on edits, history-row hygiene, drafts as
  `active: false` rows.
- **Timing**: CLI pieces land as stacked PRs (server stack gates them). Test #1 keeps
  driving v2 until piece 3.2+; all new outcome specs pin to the wire shape so they
  survive the swap unchanged.

Plan for building out `packages/ax-evals` — the suite testing whether coding agents
(+ our skill + CLI) model Autumn pricing correctly. Grounded in five research passes
(Aug 2026): catalog capability map, git history of shipped features, docs survey,
ambiguity-eval design practice, edge-case sourcing practice. Method reference:
`/ax-evals` skill (`ai/config/skills/eng/ax-evals/`).

## Part A — approach

### A1. The case-authoring method (every case family follows this)

1. **One gold fixture per scenario**: complete persona brief + golden config + outcome
   spec (policy assertions on the *resolved model*, never config-text diffs — multiple
   valid modelings exist).
2. **Generate ambiguity by ablation** (ClarEval): from the gold brief, derive variants
   via three mutation operators — REMOVE-premise (drop the interval / consumability /
   credit ratio), REMOVE-goal, REPLACE-term (schema word → colloquialism; "10 AI
   credits"). Replace-term is the empirically hardest class and our highest-value one.
3. **Label ask-vs-infer mechanically**, not by taste: a dropped premise is *must-ask*
   only when ≥2 defensible interpretations produce materially different configs;
   otherwise *should-infer* with a named default. Ties favor inferring (anti-over-ask).
4. **Every ambiguous case gets an unambiguous twin** (negative control), or the suite
   trains chronic over-asking.
5. **Scripted user = deterministic simulator**: trigger keyword → canned answer from
   the gold spec; fallback "no specific requirement, use best practices". No LLM user
   in CI (stable across skill rewrites); LLM-persona realism only in nightly goldens.
6. **Brief language is user language**: written from pricing pages / sales-call
   phrasing, linted for schema tokens (`consumable`, `prepaid`, `rollover`, `interval`
   appearing in a brief = case too easy). Docs vocabulary tables (incl. the four
   incompatible prepaid-quantity vocabularies users will actually use) feed personas.
7. **Grader proof stays mandatory**: golden ⇒ all 1s, empty ⇒ 0s, before a case counts.

### A2. Grading ladder (extends what's built)

- Tier now: atmn parse/validate + wire-shape policy assertions (built).
- Add: **must-not** assertions (didn't ask on clear briefs, didn't write on vague
  ones), **question-quality** gate (deterministic: no write/push before the user's
  answer; judge only relevance after the gate).
- Add later: **server-preview grading** — today's grader uses atmn's local validation,
  which is blind to the entire server-side rule surface (see B6); pushing preview
  through the server closes that.
- **Metamorphic pairs**: semantics-preserving rewrites (units phrasing, currency
  words, plural/singular, reordered facts) must produce the identical resolved model.
  Free oracles — no goldens needed, scales to hundreds of cheap cases.

### A3. Coverage discipline

NIST t-way, not cross-product: one case per axis *value* (singles) → pairwise over
axes → 3-way only where interaction bugs are evidenced (credit system × rollover ×
reset). Every case carries tags: axis values covered + provenance (doc page /
validator rule / git PR / ticket). Coverage report = the tag matrix.

### A4. Suite hygiene

- **Benchmark vs regression split**: curated breadth set (stable, reportable) vs
  failure-derived depth set (grows from every prod/skill failure).
- ~70% pass on capability cases is healthy; 100% = saturated → harden or graduate to
  regression. pass@k for capability, pass^k for invariants.
- **Retire rule**: once a failure mode is enforced by a validator/type, its case moves
  to unit tests.
- CI: path-filtered smoke (skill/atmn/agent-docs paths); nightly full suite with
  trials; production-mining loop (Braintrust logs → dataset) once real traffic exists.

### A5. Order of operations

1. **Phase 0 — harness hardening** (small): simulator util (trigger→answer),
   must-not + question-gate expectations, case tags/provenance, per-case trials,
   metamorphic runner. No new capability knowledge needed.
2. **Evals before skill work**: each phase below first *baselines the current skill*
   (expect ugly numbers — that's the point), so the new setup skill has a target to
   beat and every skill edit gets a same-day regression signal.
3. Phases B1→B7 in order; each is PR-sized batches of 5–15 cases; one case family per
   PR so failures localize.

## Part B — phased coverage plan

Sources: the 17-decision table + constraint inventory (catalog map), the 18 doc golden
configs, `server/tests/integration/catalog-v2/plans/CASES.md` (1,374-line behavior
matrix — reuse, don't reinvent), git-history priority ranking.

### B1. Core modeling (singles) — ~10 gold fixtures + clear-brief cases
Free/default plan, flat subscription (+annual), included+overage, per-unit seats,
prepaid buckets, one-off/lifetime + setup fee, trials (carded/cardless), add-ons.
All have drop-in golden configs in `apps/docs/.../modelling-pricing/`. Extends the
existing `writingAssistant` fixture; `cases/` gains domain folders here.

### B2. Ambiguity layer on B1 — ~2–3 ablations per fixture + twins
The "10 AI credits" class: ablate interval, consumability, prepaid-vs-usage,
credit-vs-feature. Ask-vs-infer labels per A1.3. This phase is where decisions 1, 2,
11, 12, 13 (prepaid/usage, consumable, reset/rollover, one-off, trial-vs-free) get
their vague-brief tests.

### B3. Credit systems — the git-history priority tier
Classic flat schema, `billing_units`, **graduated rate cards** (V2.3 — API field
names differ from DB names; agents on stale docs write wrong keys), monetary credits,
`ai_credit_system` markups (model→provider→default cascade, `-100` = free),
`invoice_credit` (documented nowhere). Newest surface, least documented, highest
drift risk.

### B4. Price shapes & item knobs
Graduated vs volume tiers (volume = prepaid-only — good trap), `tier_behavior`
required-ness (docs say optional, type says required), `billing_units`,
`max_purchase` vs usage_limits confusion, rollover (`max` xor `max_percentage`,
expiry), reset intervals incl. no-reset, multi-currency (org-gated).

### B5. Multi-plan architecture
Groups vs add-ons, **variant vs separate plan vs new version** (decision 7 — the
densest judgment call), licenses vs prepaid seat items (licenses: `prepaid_only`
required, no paid features, no pooled), entity scoping vs pooled.
**Blockers to respect**: `pooled` and `entity_feature_id` aren't CLI-expressible
today (the latter is typed but silently dropped); catalogV2 versioning params
(`version_slug`/`active`/`propagate`) unreachable from atmn. Those cases start as
API/MCP-arm or wait for the atmn rework — tagged now, written when reachable.

### B6. Negative + validator-inversion suite
Invert the validator: each distinct rule family (from the constraint inventory:
tier/proration/rollover/pooling/credit-schema/versioning/default-flag/license rules)
gets a brief whose *naive* modeling triggers it; grade three-way
avoided/recovered/stuck. Also the doc-contradiction traps (docs teach nonexistent
`onDecrease: no_action`/`refund_immediately`; `quantity` semantics contradiction
between prepaid-pricing and per-seat pages). Requires server-preview grading (A2).

### B7. Conduct + operations
Existing config → edit-not-nuke; push-only-after-approval; approval-gated flows;
multi-turn interviews with the simulator; production-mined regression cases.

## Found while researching — fold into the atmn rework (real bugs, pre-eval)

1. **Proration enums**: atmn's `onIncrease`/`onDecrease` values have ZERO overlap
   with server enums (`charge_immediately`, `refund_immediately`, `no_action` don't
   exist server-side; passed through verbatim) → any `proration` block in
   autumn.config.ts fails server zod. The shipped skill and three doc pages teach the
   wrong values.
2. `entity_feature_id` typed on atmn `PlanItem` but never emitted by
   `transformPlanToApi` — silently dropped.
3. `packages/atmn` readme/AGENTS.md advertise a `planFeature()` builder that doesn't
   exist.
4. atmn `validate.ts` error text omits `ai_credit_system` from valid feature types.
5. `variant.customize.items` is type-legal in atmn but server-rejected
   (`DiffedCustomizePlanV1Schema.strict()`).
6. Docs: `concepts/versioning.mdx` + `rewards.mdx` wholesale stale; `spend-limits.mdx`
   contradicts plan-level billing controls; agent-docs `composeSkill.ts` emits a stray
   `</intro>` closer.
