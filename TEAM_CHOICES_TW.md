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

### 5. Preview/apply inconsistency for `disable_version` on variants
- **What happened:** after the versioning-ladder fix (`27a29cd63`), apply versions a
  customer-bearing variant on bare propagation even under request-level
  `disable_version`, but `previewAffectedVariants` still reports
  `versionable: false` for that case. No test covers the combination.
- **Decision needed:** which behavior is intended; then align the other side and
  add the missing test.

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
- `lock_receipt_key` accessed from ARGV in the deduction Lua lock flows — same bug
  class as the fixed pathidx key; needs its own careful pass.
- `prepaid_only: false` license test failed in baseline while matching source —
  cause never explained; watch it on the next run.
- Usage-meter poll (`buildMeterUpdatePoll`) may be falling back to its fixed 160s
  loop — the usage tests still run ~4–5m; worth one debugging look.
- JWT env fix is partial (2 → 1): one customer-jwt test still fails, cause TBD.
