# atmn × agent-docs — Onboarding Rebuild (modelling-pricing first)

> Slots into the broader effort in `../agent-experience-revamp.md`. This doc is the **atmn slice**:
> migrate atmn's onboarding content onto `@autumn/agent-docs`, modernize `atmn init`, and remove rot —
> landing **modelling-pricing first** as a thin, de-risking slice, then fanning out.

---

## 1. Why

`atmn` (`bunx atmn`) is Autumn's published CLI. Its `init` flow installs AI **skills** and copies a
**system prompt** to help users model pricing and integrate Autumn. That content is **hardcoded inside
atmn** and has drifted from the product, while `@autumn/agent-docs` now exists as the **single source of
truth** (canonical docs → per-surface agent artifacts). We want atmn to *consume* agent-docs instead of
carrying its own copies, so revisions happen once and propagate.

### The duplication problem (content surfaces)

The same knowledge is independently re-authored across surfaces:

| Surface | Where | Re-authors |
|---|---|---|
| In-app **pricing agent** | `server/src/internal/misc/pricingAgent/pricingAgentRouter.ts` (`SYSTEM_PROMPT` + `build_pricing`) | pricing-modeling |
| **MCP resources** | `packages/mcp/src/resources-v2/**` | concepts, modeling, billing ops |
| **atmn skills** | `packages/atmn/src/prompts/skills/*.ts` (4 hardcoded SKILL.md strings) | setup, gating, billing-page, modeling |
| **atmn kickoff prompt** | `packages/atmn/src/views/react/init/steps/HandoffStep.tsx:14-23` (clipboard `SYSTEM_PROMPT`) | orchestration |
| Dashboard onboarding "Copy prompt" | `vite/src/views/onboarding4/onboardingPrompts.ts` | (already consumes `atmn/skills` — the one good link) |

`agent-docs` exposes `@autumn/agent-docs/skills` (`skills` + `writeSkills`; README marks it *"future atmn
use"*) but defines only `autumn-concepts` today. `ai/config/skills/**` is internal repo tooling — out of scope.

---

## 2. How atmn works today (so the migration is grounded)

atmn is **config-as-code for your pricing** — think Terraform/Prisma for the billing model.

### The DSL (`packages/atmn/src/compose/`)

Three builders, exported from the `atmn` package:

- `feature({ id, name, type, consumable, creditSchema, eventNames })` — what's tracked/gated/billed.
  Types: `boolean`, `metered` (`consumable:true` = API calls/messages; `false` = seats/storage),
  `credit_system` (maps metered features → credit costs), `ai_credit_system` (model markups).
- `plan({ id, name, items, price, addOn, autoEnable, group, freeTrial })`.
- `item({ featureId, included, reset, price })` — how a feature is granted/priced inside a plan
  (included usage, reset interval, tiers, `billingMethod: 'prepaid' | 'usage_based'`, `billingUnits`).

The builders are thin; the power is the **types in `compose/models/`, auto-generated from `@autumn/shared`**
(`pnpm gen:atmn`), so the DSL stays locked to the real schema.

A real `autumn.config.ts` exports `features: Feature[]` and `plans: Plan[]` — the single source of truth
for the user's pricing, versioned in git.

### The sync loop

- **`atmn pull`** (`commands/pull/pull.ts`): fetch plans+features from the API → API→SDK transform →
  **smart in-place update** of `autumn.config.ts` (preserves formatting/comments) → optionally regenerate
  `@useautumn-sdk.d.ts` (typed feature/plan IDs for the user's app code, merged across sandbox+live).
  Auto-recovers on 401 (OAuth → retry).
- **`atmn push`** (`commands/push/push.ts`): a real **diff/reconcile engine** —
  - `analyzePush` diffs local vs remote with **normalized comparison** (strips defaults like
    `unlimited:false`, `billingUnits:1`, `intervalCount:1`, empty `group`; sorts) so cosmetic diffs don't write.
  - **Billing-aware safety rails:** `checkPlanForVersioning` (updating a plan with customers may create a
    new *version*), `checkPlanDeleteInfo` / `checkFeatureDeleteInfo` (won't delete a plan with customers or
    a feature referenced by a credit system/product), dependency ordering (credit systems first; defer
    versioning recheck until after feature upserts).

### Transforms (`lib/transforms/`)

Three shapes of the same data: **apiToSdk** (pull), **sdkToApi** (push), **sdkToCode** (render TS).
This JSON↔DSL machinery is **push/pull-only** — it is NOT used when installing skills.

### Skill install today

`useCreateSkills.ts:64-72` writes `skill.content` **verbatim** to `<dir>/<id>/SKILL.md` — no transform.
Examples inside the skills are hand-authored in DSL form.

---

## 3. Key decisions (from discussion)

- **Skills-first, MCP-optional.** Skills are the headline install — cheap (~50 tokens/skill at rest; body
  lazy-loaded via progressive disclosure), repo-versioned, offline. MCP is an *optional* live-account layer
  (tools for CRUD/preview/logs). `init` defaults to installing skills and *asks* about the MCP.

- **Two audiences that can't share a channel.** *Repo coding agents* (Cursor, Claude Code) use **skills**
  (they live in the repo, work offline). *No-repo / chat agents* (Claude Desktop, ChatGPT, Leaf) have no
  repo to hold a skill, so they rely on the **MCP** (resources + tools). Both surfaces intentionally exist.
  ("Host agent" = the no-repo/chat case.)

- **Context bloat is mostly a non-issue here.** The bloat numbers online are about **MCP tool schemas**
  (preloaded). **MCP resources are lazy-loaded** (read on demand) — only lightweight metadata is listed up
  front — exactly like a skill's frontmatter. So shipping the same `concepts` ontology to both a skill and
  an MCP resource is not a standing context cost.

- **Content routing — only the ontology is shared:**
  - **concepts ontology** (feature types, credit systems, items, resets, tiers, prepaid vs usage_based) →
    emitted to **both** a skill and the MCP `concepts` resource.
  - **atmn config.ts/push workflow** → **skill-only** (it's inherently repo + CLI specific). Chat agents
    model pricing via the MCP's `createPlan`/`updatePlan` **tools** + the existing tool-oriented
    `plan-management` resource. The atmn workflow is **never** shipped as an MCP resource.

- **agent-docs is text-composition, not format-transform.** Its translate layer only does MDX→markdown +
  concatenation — there is no JSON↔DSL conversion. So skills must source from **DSL-first canonical pages**
  (`apps/docs/mintlify/cli/{config,commands}.mdx` already are). Mixed pages (e.g. `documentation/modelling-pricing/*`
  carry DSL + runtime API/JSON examples) must be **curated** so runtime JSON doesn't leak into the
  "author your config" skill. If we ever wanted DSL generated from JSON, that's a new transform — a non-goal.

- **Skill = knowledge; prompt = kickoff.** A skill's frontmatter `description` already auto-surfaces it to
  skill-aware agents. So the copied prompt's job is to *start intent* ("model my pricing in Autumn") and
  *point generically* at the installed skills (also works for paste-into-chat agents) — not to re-explain
  or re-list each skill.

- **modelling-pricing skill = thin SKILL.md, mostly `<reference>`.** Keep the body lean (ontology +
  pointers); push the config.ts/push workflow into `references/` (loaded on demand once the agent commits
  to modeling). Leanest at rest; the one extra hop is paid only when actually modeling.

---

## 4. Plan — modelling-pricing first, then fan out

### Phase 1 — MVP: modelling-pricing end-to-end (de-risking slice)

Ship ONLY the modelling-pricing skill through the new pipe; prove agent-docs → atmn → dashboard works.

1. **Parity audit (modelling-pricing only, no code).** Read `autumn-modelling-pricing-plans.ts` fully, map
   sections to canonical pages (`cli/config.mdx`, `cli/commands.mdx`, `documentation/modelling-pricing/*`),
   produce a gap list; resolve gaps into canonical docs (preferred) or the skill mdx framing. Gates authoring.
2. **Author in agent-docs** (`agent-docs.config.ts`, `content/skills/modelling-pricing.mdx`): a
   `autumn-modelling-pricing-plans` entry, **skill format only** (no MCP resource). **Thin SKILL.md, mostly
   `<reference>`** — body = ontology + pointers; config.ts/push workflow into `references/` via `<reference>`
   (sourced from `cli/config.mdx`, `cli/commands.mdx`). Curate mixed pages so only DSL lands here.
3. **Fix `writeSkills`** (`src/consume/skills.ts:11-17`) to also emit `skill.references[]` (currently dropped).
4. **Move the kickoff prompt into agent-docs:** add optional `prompt` format (`Entry.formats.prompt` in
   `src/config/types.ts:26-33`), `composePrompt`/`toPrompt`, emit `src/generated/prompts.generated.ts`,
   expose `@autumn/agent-docs/prompt` (`src/consume/prompt.ts`). Content = kickoff + generic pointer to
   installed skills (replaces `HandoffStep.tsx:14-23`).
5. **atmn consumes agent-docs — via a temporary bridge:**
   - Add `@autumn/agent-docs` devDependency (bundled at build like `@autumn/shared`; turbo runs agent-docs `gen` first).
   - `atmn/skills` becomes a **union**: modelling-pricing from `@autumn/agent-docs/skills` + the still-hardcoded
     `setup`/`gating`/`billing-page`. **Preserve named exports** `autumnSetupContent` / `autumnGatingContent`
     (the dashboard `onboardingPrompts.ts` imports them and strips frontmatter itself).
   - `useCreateSkills.ts`: write `SKILL.md` **and** `references/`; delete the dead `autumn-pricing` filter.
   - `HandoffStep.tsx`: source the clipboard prompt from `@autumn/agent-docs/prompt`.

   **Slice done when:** `bunx atmn init` installs an agent-docs-generated modelling-pricing skill (with
   `references/`), the other 3 skills still install, and the dashboard "Copy prompt" still works.

### Phase 2 — Fan out remaining skills

Repeat the audit/author steps for `setup`, `gating`, `billing-page` (skill-only, sourced from canonical
`autumn-js` docs). Then **delete** `src/prompts/skills/*.ts`, drop the bridge, and repoint `atmn/skills` to
re-export `@autumn/agent-docs/skills` (keeping named-export shims off the `skills` array).

### Phase 3 — `init` UX modernization

- **Optional MCP step:** after skills, ask *"Install the Autumn MCP server?"*; on yes reuse the real
  `installMcpForAgents` (`useAgentSetup.ts:61-90`); non-Claude → copy URL.
- **Replace lorem-ipsum:** rewrite `useAgentSetup.ts:13-44` so any CLAUDE.md/AGENTS.md content is real
  (sourced from agent-docs); wire the dead `AgentStep` into `InitFlow` or fold into `HandoffStep`.
- **Refresh locations:** expand `PRESET_LOCATIONS` (`HandoffStep.tsx:44-51`) to `.claude/skills`,
  `.cursor/skills`, `.opencode`, `.agents/skills`, custom.
- **Headless parity:** `HeadlessInitFlow.tsx` writes the same skills + references.

### Phase 4 — Staleness cleanup

Delete `useCreateGuides.ts`, `StripeStep.tsx`, the old template system (`lib/constants/templates.ts` +
`views/react/template/TemplateSelector.tsx` + hidden `test-template`). Fix `AGENTS.md` OAuth client-id
(doc `qncNu…` vs code `hAWUo…`, `commands/auth/constants.ts:7`) and stale `source/`/`autumn-pricing` refs.

### Phase 5 — Broader refresh (audit-then-act)

Audit `push`/`pull`/`compose` + bundled templates against the current API/feature set; produce a punch-list;
act on high-value drift; decide if any new feature warrants a command.

---

## 5. Verification

1. `cd packages/agent-docs && bun run gen && bun run ts` — modelling-pricing skill + prompt generate/typecheck;
   eyeball `generated/skills/autumn-modelling-pricing-plans/SKILL.md` + `references/` vs the parity table;
   confirm no MCP resource was created for the atmn workflow.
2. `cd packages/atmn && bun run build && bun run test` — bundle builds with agent-docs inlined.
3. Scratch sandbox: `bunx <local-atmn> init` → modelling-pricing skill written **with `references/`**; other
   3 skills still present (Phase 1) / sourced from agent-docs (Phase 2+); MCP prompt only on accept; no
   lorem ipsum; clipboard prompt matches `@autumn/agent-docs/prompt`.
4. `atmn init --headless` writes the same skills (+ references).
5. Dashboard onboarding "Copy prompt" (`onboardingPrompts.ts`) still copies sensible frontmatter-stripped content.
6. Grep atmn for residual hardcoded skill/prompt strings + dead refs (`autumn-pricing`, `useCreateGuides`,
   `StripeStep`, lorem) → none after Phase 4.

---

## 6. Open follow-ups (non-blocking)

- Whether CLAUDE.md/AGENTS.md generation earns its keep vs. relying solely on skills (revisit after Phase 3).
- Phase 5 command additions depend on the push/pull audit.
- Align with `../agent-experience-revamp.md` — the in-app pricing agent + MCP resource consolidation are
  tracked there; this doc owns the atmn + skills surface.
