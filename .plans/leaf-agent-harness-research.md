# Leaf Agent Harness Research — Eve + Autumn-native architecture

> Research snapshot (2026-08-15). Goal: how to build a purpose-built Autumn billing agent
> harness (investigate + billing actions + catalog), using Vercel Eve as the foundation —
> not a thin API/MCP wrapper.

---

## 1. Verdict

**Eve is the right runtime foundation.** Leaf already depends on `eve@^0.16.2` and runs an
`agent/` directory with Autumn MCP as a connection, Eve skills from `@autumn/agent-docs`,
and an embedded Eve server in prod.

The gap is not “pick a framework.” The gap is that Leaf is still a **dual-stack product**:

| Layer | What it owns today | Problem |
|---|---|---|
| Eve (`apps/leaf/agent/`) | Model loop, skills, MCP connection, approvals-on-tools, durability | Thin: default tools disabled; no subagents; almost no Autumn-specific tools |
| Leaf harness (`src/harness/eve/`, ~2.8k LOC) | Session mapping, stream replay, Slack/web presentation, catalog decision cards, custom approval DB | Reimplements what Eve sessions/HITL/channels already model |
| chat-adapter + Mastra leftovers | Slack/web transport, titles, evals | Parallel stacks for messaging + observability |
| `@autumn/mcp` + `@autumn/agent-docs` | Capability + judgment | Correct split; underused by the Eve agent shape |

**Best path:** treat Eve as the agent OS; make Leaf a thin multi-tenant shell (auth, org/env,
channel UX, policy); move domain behavior into Eve skills + declared subagents + a small set
of Autumn-native tools — with MCP as the governed data/action plane, not the product.

---

## 2. What Eve gives you (foundation)

From Eve docs (`node_modules/eve/docs`, eve.dev) and Leaf’s current wiring:

### Filesystem-first agent

```text
agent/
  agent.ts              # model, compaction, workflow world
  instructions.ts|md    # always-on system prompt
  tools/                # one file = one tool (or disableTool)
  skills/               # on-demand procedures (load_skill)
  connections/          # MCP / OpenAPI (connection_search)
  channels/             # HTTP, Slack, …
  subagents/<id>/       # specialists with own tools/skills
  sandbox.ts            # isolated compute
```

### Runtime primitives that matter for billing

1. **Durable sessions / turns / steps** — Workflow SDK checkpoints; survives redeploy; parked
   work for HITL / OAuth / long tools.
2. **Default harness** — compaction, `ask_question`, `todo`, `load_skill`, `connection_search`,
   built-in `agent` (self-copy) + declared subagents.
3. **Approval policy on tools/connections** — `user-approval` / deny / allow per tool call;
   multi-tenant approval pattern is first-class.
4. **Connections** — MCP tools discovered via `connection_search`, then called as
   `autumn__getCustomer`-style qualified names.
5. **Skills** — progressive disclosure; Leaf already maps `leafSkills` from agent-docs into
   Eve dynamic skills on `session.started`.

Leaf already uses: Postgres workflow world, leaf-internal auth on the Eve channel, Autumn MCP
connection with write tools gated to `user-approval`, and disables shell/file/web defaults
(correct for a billing agent).

---

## 3. What production usage says users need

Queried Axiom `leaf` via Executor (last 14d, production).

### Traffic shape

| Kind (heuristic) | Calls | Share |
|---|---:|---:|
| Read (customers, plans, features, org, …) | ~11.3k | ~91% |
| Investigate (`searchRequestLogs` / `queryRequestLogs`) | ~726 | ~6% |
| Write / preview (attach, catalog, schedules, …) | ~366 | ~3% |

### Top MCP tools

| Tool | Calls |
|---|---:|
| `listCustomers` | 5,496 |
| `getCustomer` | 4,888 |
| `searchRequestLogs` | 502 |
| `listPlans` | 252 |
| `queryRequestLogs` | 224 |
| `getCurrentOrganization` | 218 |
| `previewUpdateCatalog` / `updateCatalog` | 91 / 57 |
| `updateSubscription` | 77 |
| `previewAttach` / `attach` | 47 / 20 |

### Who is calling

| Client family | Calls | Meaning |
|---|---:|---|
| Bun (Leaf) | ~5.2k | Hosted agent (Slack/dashboard) |
| Codex MCP | ~5.0k | User coding agents on Autumn MCP |
| Claude (Code/Desktop) | ~1.6k | Same — external MCP consumers |

So the **MCP surface is already a product** used by Codex/Claude, not only Leaf. The harness
must make Leaf *better at jobs* while keeping MCP excellent for host agents.

### Investigate patterns (real query shapes)

Agents repeatedly:

- Anchor on `customer_id` (+ Stripe event types, `source == 'stripe_webhook'`)
- Fail when they send free-text / bare IDs / wrong grammar (`"scholarship"`, raw UUID alone)
- Page wide windows of `balances.track` in 7-day chunks
- Mix correct pipeline syntax with inventing `path` instead of `request_path`

Errors concentrate on `getCustomer` (wrong ID), `searchRequestLogs` (bad query language),
and `previewAttach` (~34% error rate in sample — param/entity/customize mistakes).

### Slack reality

~100 Slack messages / 14d vs 12k MCP tool calls — Slack is still early; most intelligence
work is already MCP-driven. Slack threads are multi-turn, short follow-ups, approval-gated
writes (only ~7 approval_created events — writes are rare but high stakes).

### Eval scenarios already encode the hard jobs

Leaf evals cover: attach (new customer, checkout, entity rules, credits, custom price),
schedules (multi-year escalator, backdated, custom boolean), update-subscription, catalog
versioning, approval. Those are the golden paths the harness must make easy.

---

## 4. Why Leaf feels “badly built”

Not because Eve was the wrong bet — because Leaf is mid-migration and product logic lives in
the wrong layer.

1. **Wrapper over MCP, not a job harness.** The Eve agent mostly `connection_search` + MCP
   tools. Skills exist (`autumn-investigate`, `autumn-billing`, `autumn-catalog`, concepts) but
   there are **no declared subagents**, almost no Autumn-authored tools, and all default
   harness tools are disabled (including `todo` / useful scaffolding).
2. **Second durability/HITL stack.** `src/harness/eve/*` re-implements stream cursor healing,
   parked-input classification, superseded approvals, catalog decision routing, and a parallel
   chat-approval DB — on top of Eve’s own park/resume and approval events. That is where most
   of the complexity (and stream disconnect bugs) lives.
3. **Channel UX owns too much policy.** Catalog versioning/migration decision cards are
   dashboard-specific prose + structured context bolted onto turns (`instructions.ts`), rather
   than a first-class Eve tool + `ask_question` / approval flow shared across Slack + web.
4. **Dual messaging stacks.** chat-adapter (Slack/web) + Eve channel + custom presenters.
   Eve already has Slack/HTTP channels; Leaf’s custom path was needed for Autumn tenancy, but
   the end state should be “Eve channel + Autumn auth attributes,” not a second agent runtime.
5. **Content is ahead of architecture.** `@autumn/agent-docs` + MCP resources correctly separate
   *judgment* (skills) from *capability* (tools). The agent OS does not yet route jobs into
   those skills/subagents by design.

---

## 5. Target architecture (Autumn-native harness on Eve)

```text
┌─────────────────────────────────────────────────────────────┐
│  Surfaces: Dashboard chat · Slack · (future) API / schedules │
│  Thin Leaf shell: tenancy, OAuth tokens, org/env, UI cards   │
└───────────────────────────┬─────────────────────────────────┘
                            │ Eve channel (auth attributes:
                            │ orgId, appEnv, providerUserId, …)
┌───────────────────────────▼─────────────────────────────────┐
│  Root Eve agent — router / conductor                         │
│  Always-on: personality, safety, “pick a job”, ask_question  │
│  Skills index (names+descriptions only until load_skill)     │
└───────┬─────────────────┬──────────────────┬────────────────┘
        │                 │                  │
   ┌────▼────┐     ┌──────▼──────┐    ┌──────▼──────┐
   │ investigate│   │ billing    │    │ catalog     │
   │ subagent   │   │ subagent   │    │ subagent    │
   │ skill+tools│   │ skill+tools│    │ skill+tools │
   └────┬────┘     └──────┬──────┘    └──────┬──────┘
        │                 │                  │
        └────────────┬────┴──────────────────┘
                     ▼
        Autumn connection (MCP) — governed CRUD + logs
        + a few Autumn-authored tools that compose MCP
          (e.g. investigateCustomer, previewBillingChange)
```

### Layer responsibilities

| Layer | Owns | Does not own |
|---|---|---|
| **Leaf shell** | Multi-tenant auth, token vault, Slack/web chrome, org/env selection, rendering Eve events | Billing workflows, log query recipes, prompt walls |
| **Eve root agent** | Routing, clarification, budgets, compaction, when to delegate | Domain procedures |
| **Subagents** | One job each: investigate / bill / model catalog | Cross-tenant auth |
| **Skills (agent-docs)** | How to do the job (checklists, references) | Live data |
| **MCP connection** | Typed Autumn operations + approval gates | Conversation UX |
| **Authored tools** | Job-shaped compositions, safer schemas, structured outputs | Replacing the API |

This mirrors Anthropic’s finance-agent template pattern (2026): **skills + connectors +
subagents**, with humans at approval gates — not a single megaprompt with 40 tools.

---

## 6. Job designs (what “purpose-built” means)

### A. Investigate (high frequency, high error today)

**User jobs:** “Why was this customer charged twice?”, “Why is check denied?”, “Show me their
billing timeline / Stripe sync.”

**Harness design:**

1. Declared subagent `investigate` with only: customer lookup tools, `queryRequestLogs` /
   `searchRequestLogs`, date helpers, maybe Stripe-oriented helpers — **not** attach/update.
2. Skill `autumn-investigate` (already exists) as the procedure; force the two-pass pattern
   (aggregate locate → narrow search) in the subagent instructions, not hope the model loads
   the skill.
3. Authored tool `investigate_customer` (optional but high leverage):
   - Input: `{ customer_id | email | name, when?, what? }`
   - Internally: resolve customer → `getCustomer` → `queryRequestLogs` buckets → return a
     structured `InvestigationBrief` (timeline candidates, open questions).
   - Model still drills with `searchRequestLogs`, but cannot start with free-text queries.
4. Harden MCP: reject / rewrite common bad queries (bare ID, `path` vs `request_path`) with
   actionable errors — already a top failure mode.

### B. Billing actions (low frequency, high stakes)

**User jobs:** attach plan, customize price/credits, schedule phases, update/cancel
subscription, invoice-mode deals.

**Harness design:**

1. Subagent `billing` with billing + customer tools; catalog tools read-only.
2. Skill `autumn-billing` checklist stays the source of truth (agent rules → resolve targets →
   params → timing → preview → write-as-approval).
3. Never double-prompt: Eve `user-approval` on write tools **is** the confirm UX; Slack/web
   only present Eve’s `input.requested` / preview payload (Leaf already has render helpers).
4. Authored `plan_billing_change` tool that returns a structured plan object before preview —
   reduces `previewAttach` param errors.
5. Idempotency: key writes with `sessionId:turnId` (Eve multi-tenant approval docs emphasize
   this for charges).

### C. Catalog / pricing (dashboard-heavy)

**User jobs:** create/edit plans & features, versioning, variants, migration drafts.

**Harness design:**

1. Subagent `catalog` focused on `previewUpdateCatalog` / `updateCatalog` + list/get plans.
2. Replace dashboard-only prose in `instructions.ts` with a first-class **catalog decision**
   tool or Eve `ask_question` options that all channels understand — so Slack gets the same
   versioning semantics without a special decision card protocol.
3. Keep agent-docs `autumn-catalog` skill as progressive disclosure.

### D. External MCP hosts (Codex / Claude)

Do **not** force them through Leaf. Keep MCP + skills/resources excellent. Optionally ship
the same job tools (`investigate_customer`, …) on MCP so host agents get the harness benefits
without the Eve UI.

---

## 7. How to use Eve specifically (concrete)

### Keep / deepen

- `agent/connections/autumn.ts` — MCP connection + approval set (extend policy with roles/
  env: sandbox freer, live stricter).
- `agent/skills/autumn.ts` — dynamic skills from `@autumn/agent-docs` (good).
- `agent/channels/eve.ts` — leaf-internal auth attributes (org/env/provider).
- Postgres workflow world for durable sessions.
- Disabled bash/fs/web defaults for the billing agent.

### Add

```text
agent/subagents/investigate/{agent.ts,instructions.md,skills/,tools/}
agent/subagents/billing/{…}
agent/subagents/catalog/{…}
agent/tools/investigate_customer.ts   # optional composition
agent/tools/plan_billing_change.ts
agent/hooks/…                         # telemetry → Axiom leaf events
```

Root `instructions` become a **thin router**: identity + safety + “delegate to investigate |
billing | catalog; load the matching skill first.” Move dashboard versioning rules into the
catalog subagent.

### Slim Leaf shell

Long-term, delete most of `src/harness/eve/` by:

1. Using Eve’s stream + continuation tokens as the session source of truth.
2. Mapping Eve `input.requested` → Slack/web approval UI (one presenter).
3. Storing only Autumn thread↔session index + tenancy metadata in Postgres — not a second
   approval state machine if Eve’s parked approvals suffice.
4. Prefer Eve’s Slack channel **or** keep chat-adapter only as a webhook adapter that posts
   into Eve — not a second agent loop.

Migration can be incremental: subagents + authored tools first (biggest user value), harness
thinning second (biggest maintainability win).

### Deploy posture

- Today: embedded Eve in the Leaf task (`embeddedServer.ts`) — fine for one service.
- Eve-native: Vercel Functions + Workflows + AI Gateway + Observability if you want platform
  HITL/dashboard for free; self-host with `@workflow/world-postgres` remains valid.
- Beta caveat: Eve is public beta; pin versions; treat workflow world package line as a
  hard constraint (Leaf already notes Zod union failures on mismatch).

---

## 8. Industry alignment (2026)

Convergent best practices that match this design:

| Practice | Apply to Autumn |
|---|---|
| Skills = judgment; MCP = capability | Already in agent-docs plan — finish wiring |
| Progressive disclosure | Keep SKILL.md thin; references on demand |
| Lean tool surface / connection_search | Don’t dump 40 tools into every turn; subagents narrow |
| Draft → approve → commit for writes | Preview tools + Eve user-approval |
| Durable workflows | Eve sessions; don’t rebuild |
| Subagents for jobs | investigate / billing / catalog |
| Evals as the product spec | Expand Braintrust cases from real Axiom failures |
| Host agents vs in-app agents | MCP+skills for Codex/Claude; Eve for Leaf UX |

---

## 9. Recommended roadmap (technical, not calendar)

### Phase 0 — Instrument the jobs

- Tag Leaf turns with `job` ∈ {investigate, billing, catalog, other} (from routing or
  skill loads).
- Log skill load + subagent delegation in `leaf` dataset.
- Mine Axiom for top investigate/billing failure signatures into eval fixtures.

### Phase 1 — Eve job topology (highest leverage)

- Add three declared subagents + thin root router instructions.
- Re-enable `ask_question` / `todo` where useful; keep shell/fs off.
- Stop stuffing surface-specific versioning prose into the root prompt.

### Phase 2 — Job-shaped tools

- `investigate_customer` + stricter log query validation in MCP.
- `plan_billing_change` / structured attach params to cut previewAttach errors.
- Shared preview payload contract for Slack + web (one renderer).

### Phase 3 — Thin the harness

- Collapse custom approval DB toward Eve parked approvals where possible.
- Single session store; delete stream-heal complexity as Eve client matures.
- Unify observability (Eve OTel hooks → Axiom; retire Mastra-only paths).

### Phase 4 — One content → many consumers

- Continue agent-experience-revamp: agent-docs → MCP resources + Eve skills + atmn.
- Same investigate/billing skills power Leaf subagents and external MCP hosts.

---

## 10. Anti-goals

- Replacing Eve with Mastra/LangGraph “because we already have glue code.”
- Growing Leaf into a mega-prompt that lists every Autumn field.
- Exposing raw Stripe/DB to the model when request logs + customer state suffice.
- Building a generic “AI ops” agent — stay billing-domain.
- Letting host-agent MCP and Leaf diverge into two ontologies.

---

## 11. Sources

- Code: `apps/leaf/agent/**`, `apps/leaf/src/harness/eve/**`, `packages/agent-docs/**`,
  `packages/mcp/**`, `.plans/agent-experience-revamp.md`
- Eve: `apps/leaf/node_modules/eve/docs/**`, https://eve.dev/docs, https://vercel.com/docs/eve
- Production: Axiom `leaf` via Executor `axiom_mcp.org.production.querydataset` (14d window)
- Patterns: Anthropic finance agents (skills + connectors + subagents, May 2026);
  2026 harness guides (permissions, draft-commit, progressive disclosure, durable workflows)
