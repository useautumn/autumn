import type { TestGroup } from "./types";

// Remaining `bun tw core` failures on branch fix/tw-flakiness (run
// msg10ma3-76o5kn, 8 files — down from 20 when this work started). Every entry
// survives 45-150s of assertion polling, so none of these are settle flakes.
//
// GROUP A — track-vs-billing-action race (one shared root cause).
//   A `track` deducts in Redis and queues a sync; a billing action (attach /
//   update / cancel) then bumps cache_version; syncItemV4.ts:50-58 resolves the
//   CACHE_VERSION_MISMATCH by calling deleteCachedFullCustomer — so a deduction
//   still living only in Redis is DISCARDED rather than replayed. The asserted
//   amount comes back as the full, un-deducted total.
//   Not just a test problem: in production a track racing an attach silently
//   drops usage (unbilled revenue). The fix belongs in the sync conflict path.
//   WHICH files land here changes run to run — it follows whichever worker
//   loses the race, so treat the group, not the list, as the unit of work.
//
// GROUP B — individually genuine bugs, unrelated to each other.
//
// GROUP C — Stripe hosted pages that never complete inside a tw µVM. The
//   invoice equivalent was solved by falling back to stripeCli.invoices.pay();
//   a Checkout Session cannot be completed through the API, so this one still
//   needs the page itself to work.
const activeTempPaths: string[] = [
	// ── GROUP A: track-vs-billing-action race ───────────────────────────────
	// ✗ "scheduled-switch-basic 1b: pro to free (after cycle)"
	//   Product pro_… should not exist.
	"integration/billing/attach/scheduled-switch/scheduled-switch-basic.test.ts",
	// ✗ "attach: quantity upgrade mid-cycle with prorate immediately"
	//   Expected: 411, Received: 500 (the deduction never lands).
	"integration/billing/legacy/attach/update-quantity/legacy-update-quantity.test.ts",
	// ✗ "legacy-upgrade-usage 1: consumable upgrades Pro → Premium → Growth"
	//   Expected: -100, Received: 100.
	"integration/billing/legacy/attach/upgrade/legacy-upgrade-usage.test.ts",
	// ✗ "sub.deleted invoice: entity consumable → Stripe cancel at period end →
	//   CREATES arrear invoice" — Invoice[0] expected $40.00, got $0.00. Also
	//   "…advance 1 month → cancel immediately → no invoice", Expected 1, got 2.
	"integration/billing/stripe-webhooks/subscription-deleted/subscription-deleted-invoice.test.ts",

	// ── GROUP B: individual bugs ────────────────────────────────────────────
	// ✗ "cancel end of cycle: downgrade then cancel (with default)"
	//   Setup leaves premium canceling + pro scheduled. After
	//   cancel_action: "cancel_end_of_cycle" on premium the customer has ONLY
	//   [premium:active]: the scheduled downgrade was dropped, premium was NOT
	//   marked canceling, and the default (free) was never scheduled.
	//   Deterministic — fails the same way solo, so not cross-file collision.
	"integration/billing/update-subscription/cancel/end-of-cycle/cancel-end-of-cycle.test.ts",
	// ✗ "legacy one-off rwf: prepaid one-off charges major units, not x100"
	//   Expected: "paid", Received: "draft" after 120s. The RWF invoice on the
	//   dedicated sub-org never leaves draft, so finalize/pay is failing there.
	//   Needs server-side visibility tw does not forward.
	"integration/billing/legacy/attach/new/legacy-new-oneoff-zero-decimal.test.ts",
	// ✗ "create-schedule: now phase stays the exact active set across groups and
	//   future phases" — expect(received).toEqual(expected). Shape mismatch.
	"integration/billing/create-schedule/phases/create-schedule-phases.test.ts",

	// ── GROUP C: Stripe hosted page never completes ─────────────────────────
	// ✗ "customer.subscription.created auto-sync: links product after external
	//   Stripe checkout completion" — "Checkout session did not produce a
	//   subscription" after polling Stripe for 120s. The session is created
	//   directly through the Stripe API; our automation fills and submits the
	//   page, but Stripe never attaches a subscription to the session.
	"integration/billing/stripe-webhooks/subscription-created/sub-created-auto-sync.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "Scratch group for triaging a failing tw run",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 2,
};
