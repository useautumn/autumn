# Team decisions — test-suite campaign (`fix/tw-modal-stale-warm-migrations`)

Open questions surfaced by the green-suite campaign that need a product/team call.
Each item lists the decision, the evidence, and what unblocks when it's made.
Cross-reference: `server/tests/triage-manifest.json` for cluster-level status.

## Urgent — potential production/customer impact

### 1. Under-credited customers (double-discounted stored credits)
- **What happened:** commits `4b5476c85` (refund lines inherit active coupons) and
  `ec1e98b58` (credits derived from stored, already-discounted invoice line items)
  merged the same day via PR #1815. Combined, stored-net credits got the coupon
  applied a second time: percent-off credits shrank by the coupon %, and amount-off
  credits clamped to exactly $0.
- **Status:** code fix landed (`809d08fb3` — same-coupon stored-entry gate).
- **Decision needed:** assess the prod impact window (PR #1815 merge → deploy of the
  fix). Customers with coupons who canceled or upgraded in that window may be owed
  make-good credits. Who audits, and what's the remediation policy?

### 2. Backsync-carry-usage regression (PR #2250) — parked by you "for the end"
- **What happened:** `feat/backsync-carry-usage`'s subscription.updated auto-sync
  rebuilds entitlements from Stripe and wipes freshly tracked usage when it races a
  `track()`; the update-subscription recalculate path re-grants balances without
  carrying existing usage. ~12–15 tests across 7 files, all consistent.
- **Decision needed:** revert vs hotfix vs accept-and-respec. This is silently
  dropping tracked usage — arguably a prod data-loss bug, not just red tests.

## Product semantics — blocks specific red tests

### 3. License duplicate-assign idempotency
- **What happened:** the licenses API redesign (`f014ce111`) removed the idempotent
  short-circuit on attach: re-attaching an already-assigned entity on a full pool
  now rejects with "No available licenses" instead of no-op'ing.
- **Decision needed:** regression (restore idempotency) or intended contract (flip
  the test to expect rejection)? One test red either way until decided.

### 4. Variant opt-out re-pin semantics
- **What happened:** when a base versions and a variant opts out of propagation,
  `moveLatestVariantsToBaseVersion` still re-pins the variant to the NEW base;
  lifecycle test #11 expects it to stay pinned to the old base v1.
- **Decision needed:** does opting out preserve the old pin (and if so, always, or
  only when the variant will never receive the diff)? One test red until decided.

### 5. Variant versioning: THREE suites, three contracts (escalated)
- **What happened:** the versioning-ladder fix (`27a29cd63`) reconciled the
  catalog and lifecycle/interval-family suites — and run mrp2ud8n then revealed a
  THIRD suite, `crud/plans/versioning/variant-independent-versioning.test.ts`
  (3 tests newly red), expecting the opposite on both axes: variants edited
  IN PLACE when only the base has customers (vs lifecycle demanding they
  version), and request-level `disable_version` pinning bare propagation (vs
  lifecycle demanding it not). Mutually incompatible expectations; code can
  satisfy at most two of the three suites.
- **Also:** `previewAffectedVariants` still reports `versionable: false` where
  apply now versions (preview/apply inconsistency, untested combination).
- **Update (bisect-confirmed):** `27a29cd63` also broke
  `update-plan-migration-drafts.test.ts` ("variant custom plans follow
  include_custom") — its variant's only customer is a **custom** cusProduct, and
  `getVersioningUsage` counts custom cusProducts as versionable, so the variant
  versions when the test expects it pinned. **Candidate resolution that
  satisfies every currently-green suite plus this one:** exclude
  `is_custom = true` cusProducts from the versionable count in
  `server/src/internal/customers/cusProducts/repos/getVersioningUsage.ts:40`.
  Rationale: migration drafts default to `custom: false` targeting, and custom
  cusProducts carry frozen per-customer config that in-place edits don't govern.
  Caveat before applying: the same helper feeds base-plan versioning via
  `setupUpdateProductContext` — a base whose only customers are custom would
  then edit in place. This does NOT resolve axis (a) for
  variant-independent-versioning; that conflict stands.
- **Decision needed:** define the actual contract for (a) does base versioning
  propagate versioning to customer-bearing variants, and (b) what does
  request-level `disable_version` scope to — and whether custom-only customers
  count as versionable usage (candidate above). Then one suite gets rewritten
  and preview gets aligned.

### 6. `created_at` stamped from the billing clock
- **What happened:** billing v2 sets `customer_products.created_at` from the
  billing-context clock (frozen under Stripe test clocks, second precision), so
  same-product re-attaches can tie exactly. Worked around in the cleanup cron with
  an id tiebreak (`12a87306a`), but ties remain possible anywhere that sorts by
  `created_at`.
- **Decision needed:** should `created_at` be real wall-time (`Date.now()`) with
  billing anchors (`starts_at` etc.) staying on the billing clock? Touches a lot of
  sort sites — needs a deliberate call, not a drive-by.

### 7. Licenses: unbuilt surfaces currently `test.todo`
- preview_attach / preview_update replacements (removed without successor)
- pool disambiguation (old `pool_id`/`parent_plan_id` params removed)
- schedule-phase activation: assignment migration + expiry (webhook only
  reconciles counters today)
- **Decision needed:** are these on the roadmap (todos stay) or dead scope (delete
  the todos)?

### 8. Legacy multiAttach quantity multiplier
- **What happened:** the old `ProductOptions.quantity` (product-level multiplier)
  has no equivalent in `MultiAttachParamsV0Schema`; ~7 archived tests exercising
  quantity updates are now `test.todo`, and the transfer/entity-split tests
  asserting the old quantity-split model fail honestly.
- **Decision needed:** is a v2 multiplier/quantity-update capability planned? If
  not, archive/delete those tests instead of carrying todos.

### 11. Archived tests crash on deleted-helper imports
- **What happened:** `b6a37c676` ("migrated legacy tests to legacy/attach")
  deleted shared helpers but left 6 archived tests importing the old paths, so
  they crash at import (0 tests run) on every run.
  - `archives/contUse/update/updateContUse1-4` — import `replaceItems` (moved to
    `@tests/utils/testProductUtils`) and `attachNewContUseAndExpectCorrect`
    (moved to `expectContUse/expectUpdateContUse`). Both still exist — a
    mechanical import repoint could resurrect them (test bodies unverified).
  - `archives/newVersion/newVersion1-2` — import `runUpdateEntsTest` from
    `expectUpdateEnts.ts`, which was fully deleted (130 lines, no successor).
- **Decision needed:** fix the imports (do these archived scenarios still earn
  their keep?), or delete the 6 files as dead scope. Not OOM — no compute/mem
  change helps. Same family as #7/#8.

## Process / hygiene

### 9. Agent push discipline
- A background agent pushed to origin without authorization during the env-gaps
  wave (content was fine; process wasn't). Current mitigation: every agent brief
  now says no-commit/no-push. Decide if you want a harder guard (e.g. branch
  protection, or a pre-push hook gating non-interactive pushes).

### 10. Known-red bug-detector tests
- The manifest tracks deliberately-red tests (license pool convergence on parent
  end/cancel/migration, sandbox-copy stale product cache, licenses.list tombstone
  filter, price-only customize row reuse, trialing parent losing grants, plus the
  re-triage clusters: defaultTrial, customInterval, invoice-flow browser races).
- **Decision needed:** who owns fixing each, or explicitly accept them as red and
  tag them so the suite's green-definition excludes them.

## Follow-ups flagged, no decision required (FYI)
- Ingress drop mystery SOLVED (run mrp6o292, first with forward-retry): all 716
  drops targeted just 3 of 401 workers with zero retry recoveries — dead tunnels
  from crashed workers, not saturation. Fallout is confined to the crashed
  workers' own tests. Remaining question: what crashes those workers (crash
  files cluster on archives/contUse + archives/newVersion, all red pre-crash —
  possibly OOM on 4 GiB). Compute bump not indicated for drops.
- `lock_receipt_key` accessed from ARGV in the deduction Lua lock flows — same bug
  class as the fixed pathidx key; needs its own careful pass.
- `prepaid_only: false` license test failed in baseline while matching source —
  cause never explained; watch it on the next run.
- Usage-meter poll (`buildMeterUpdatePoll`) may be falling back to its fixed 160s
  loop — the usage tests still run ~4–5m; worth one debugging look.
- JWT env fix is partial (2 → 1): one customer-jwt test still fails, cause TBD.
