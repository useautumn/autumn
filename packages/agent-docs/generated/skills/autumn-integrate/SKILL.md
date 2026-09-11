---
name: autumn-integrate
description: Integrating Autumn into an app's backend — creating customers, billing flows (attach, checkout, upgrade, cancel), gating features with check, recording usage with track, and exposing billing data to the frontend. Use when the user asks to integrate Autumn, add billing/payments to their app, gate features, meter usage, or build checkout/upgrade flows. Requires a pushed catalog; use autumn-catalog first if plans don't exist yet.
---

# Integrate

Before using this skill, first load the `autumn-concepts` skill — it defines the objects these calls operate on — customers, plans, balances, entities.

## STRICT RULES

1. **Everything is backend.** All Autumn calls run in the app's server code with `AUTUMN_SECRET_KEY` — never in the browser. The frontend gets billing data only through the app's own endpoints.
2. **The old frontend layer is deprecated — never use or suggest it**: `autumnHandler` mounts, React hooks (`useCustomer`, `useEntity`, `AutumnProvider`), shadcn components. If an app already uses them, don't rip them out unasked — but build new work backend-only.
3. **Resolve the customer before anything else.** Every handler that checks, tracks, or attaches must serve a brand-new user: `customers.getOrCreate` with the app's own stable id (user or org id from auth — whoever pays — never an email). Never assume the customer exists.
4. **An error response is a failure.** A 4xx/5xx from any Autumn call is never "working" — read the error, fix the call.

## Order of operations

Work these in order; each step names what to settle and where the details live. Read the referenced doc before implementing the step — the snippets and parameters are there, not here.

**1 — Discover the app.** Framework, server entry points, where auth lives, which existing routes handle the actions being billed. Settle the customer id: the app's stable user or org id — whoever pays. If the product bills per workspace/project/seat, those are entities under one customer, not separate customers.

**2 — Settle the level.** Before writing any flow, ask the user how their plans and features actually work: what does a plan get bought for — the whole account, or each workspace/deployment/seat under it? And where does each feature's balance live — shared across the account, or per unit? The catalog hints (entity-scoped items, license plans) but doesn't decide — a plan can attach per deployment while credit packs stay account-wide. The answers flow through everything: `billing.attach` takes `entityId` for entity-level plans, `check`/`track` take `entityId` for entity-scoped balances, billing controls set at the matching level. Mixing levels silently misbills — an account-wide check against a per-seat balance always passes. For entities, entity-scoped balances, when to use which level, read `references/feature-entities.md`. For plans that attach per entity, read `references/entity-plans.md`.

**3 — Install and connect.** `autumn-js` (or the platform's SDK) + `AUTUMN_SECRET_KEY` in server env. One shared client in server code. For install, client setup, the end-to-end happy path, read `references/setup.md`.

**4 — Customer creation.** `customers.getOrCreate` where the app knows who the user is — signup/login hook, or lazily in billing handlers. Pass name/email when available. A default (auto-enable) plan attaches on creation — no attach call for the free tier. If step 2 settled anything at entity level, mirror this for entities: when the app creates its unit (a workspace, a deployment, a seat), create the entity then — usually in the same handler, right before the entity-level attach or check that needs it. For getOrCreate parameters, Stripe linking, pre-creating, read `references/creating-customers.md`. For creating entities, entity parameters, read `references/feature-entities.md`.

**5 — Purchase and plan changes.** All through two calls, split by intent (pass `entityId` when the plan attaches at entity level — step 2):
   - `billing.attach` — getting on a plan, AND upgrades/downgrades within a plan group: attach the new plan; a higher (monthly-normalized) price applies immediately with proration, a lower one schedules for period end. `planSchedule` overrides. Default attach charges a saved card in place and returns `checkout_url` only when payment is actually needed — handle both outcomes. Force `redirectMode: "always"` only when the product wants hosted checkout unconditionally; custom flows preview first. For hosted vs custom checkout, redirectMode, previewAttach, read `references/payment-flow.md`. For upgrade/downgrade behavior, scheduled downgrades, carry-over on upgrade, read `references/subscription-lifecycle.md`.
   - `billing.update` — changing the subscription you're on: prepaid quantities (seats), `cancelAction` (`cancel_end_of_cycle` / `cancel_immediately` / `uncancel`), customization. It never switches plans — that's attach's job. Preview twins exist for both calls — use them wherever the app shows a confirmation screen. For quantities, cancelAction, previewUpdate, prorationBehavior, read `references/updating-subscriptions.md`.
   - When several plans move together — a plan plus its add-on in one purchase, or tied cancellation — use the multi twins: `billing.multiAttach` (one checkout / one payment covering every plan) and `billing.multiUpdate` (one atomic call applying a `cancelAction` per plan). Two sequential attach/update calls mean two checkouts or a half-canceled customer, and concurrent ones trip the per-customer lock.
   - Payment snags are response **state, not exceptions**: `required_action` (3DS, payment method, failure) plus `payment_url` — handle the states, surface the URL. For 3DS, payment failures, required_action codes, read `references/edge-cases.md`.
   - For deep parameter detail on attach, update, and the other billing actions (createSchedule, discounts, custom terms), the `autumn-billing` skill is the reference — it's written for operating billing directly, but its parameter and edge-case knowledge applies when implementing these calls in code.

**6 — Check and track.** In the billed action's own handler: `check` before the work, `track` after it succeeds. Gate on `allowed` — don't re-derive access from balances. Pass `requiredBalance` when an action costs more than 1, and `entityId` when the balance lives on an entity (step 2) — check and track must agree on the level. For the check → act → track pattern, read `references/gating.md`. For check parameters, allowed semantics, credit systems, entity checks, read `references/check.md`. For track and setUsage, read `references/tracking-usage.md`.

**7 — Billing controls.** Per-customer policy on top of the plan: set via `customers.update` with `billing_controls` (`spend_limits`, `usage_limits`, `usage_alerts`, `auto_topups`, `overage_allowed`), or at purchase time by passing `billing_controls` on `billing.attach`. The flagship shape is a user-facing "overage billing on/off" toggle: off maps to a `spend_limits` entry with `skip_overage_billing: true` — overage still accrues but is never invoiced — plus an `overage_limit` (use `limit_type: "usage_percentage"`, e.g. `20` = overage up to 20% of the plan allowance) so the user is blocked at the cap instead of running up unbilled usage forever; on means clearing or replacing the entry (`skip_overage_billing: false`). Whether overage needs enabling at all depends on the plan: items with a usage price already allow it (controls only modulate the billing); pure-grant items hard-stop at zero and need `overage_allowed` per customer — which permits the overage but doesn't bill it. Alerts ("email at 80%") are `usage_alerts` with `threshold_type: "usage_percentage"`; prepaid balances self-replenish via `auto_topups`. For all five controls, field shapes, customer vs entity level, plan defaults, read `references/billing-controls.md`. For spend limit semantics, skip_overage_billing, usage alerts, read `references/spend-limits.md`. For auto top-up setup and requirements, read `references/auto-top-ups.md`.

**8 — Billing data for the frontend.** The app exposes its own endpoints calling `customers.get` / `plans.list` server-side; the UI reads those. For customer payload, plans list with eligibility, portal, read `references/display-billing.md`.

**9 — Verify.** Call the app's routes as a fresh user; confirm in sandbox that the customer exists, checks gated, usage recorded, purchase reached checkout. `customers.get` is the oracle. **Done means verified behavior — compiling is not done.** Then undo what verifying created — release the license assignments, delete the entities, and reverse the usage your test recorded (a negative `track` or `setUsage` back), and nothing more. Never delete the customer or any state that existed before you started; pre-existing subscriptions and assignments are real. Verification also re-runs flows, so billing endpoints must tolerate repeats: joining a plan you're already on returns success, not a crash.

## Gotchas the docs don't cover

- **Concurrent billing mutations on one customer return 429** — attach/update share a per-customer lock; serialize instead of retrying blindly.
- **A denied check should say what ran out** — include the feature and its balance state in the response, not a bare unexplained 403. What the caller does with it is the app's call: an API returns a clear error code, a dashboard might prompt an upgrade.

## Conduct

- Follow the app's existing patterns — router style, error handling, response shapes. Autumn code should look like the app wrote it.
- Use catalog ids exactly; never invent feature or plan ids. Missing from the catalog → say so; that's an `autumn-catalog` change, not a workaround.
- Smallest working integration first: one gated action end to end, verified, before spreading wider.

Going to production: For live keys, production checklist, read `references/deploy.md`. For fail-open behavior during Autumn outages, read `references/fail-open.md`.
