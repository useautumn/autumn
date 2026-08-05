import type { TestGroup } from "./types";

// Remaining `bun tw core` failures on branch fix/tw-flakiness — 9 files in the
// last measured run (msg2x0v6-93euww), down from 20 when this work started.
// Every entry survives 45-150s of assertion polling, so none are settle flakes.
//
// The GROUP A membership CHURNS between runs: msg10ma3 hit
// legacy-update-quantity + subscription-deleted-invoice, msg2x0v6 hit
// multi-update-basic + invoice-created-consumable + update-paid-basic instead.
// Same root cause, different losers. Any single run undercounts the blast
// radius, so fix the cause, not the listed files.
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
const activeTempPaths: string[] = [
	// ── GROUP A: track-vs-billing-action race ───────────────────────────────
	// ✗ "scheduled-switch-basic 1b: pro to free (after cycle)"
	//   Product pro_… should not exist.
	"integration/billing/attach/scheduled-switch/scheduled-switch-basic.test.ts",
	// ✗ "attach: quantity upgrade mid-cycle with prorate immediately"
	//   Expected: 411, Received: 500 (the deduction never lands).
	"integration/billing/legacy/attach/update-quantity/legacy-update-quantity.test.ts",
	"integration/billing/legacy/attach/update-quantity/legacy-update-quantity-3.test.ts",
	"integration/billing/legacy/attach/update-quantity/legacy-update-quantity-2.test.ts",
	// ✗ "legacy-upgrade-usage 1: consumable upgrades Pro → Premium → Growth"
	//   Expected: -100, Received: 100.
	"integration/billing/legacy/attach/upgrade/legacy-upgrade-usage.test.ts",
	"integration/billing/legacy/attach/upgrade/legacy-upgrade-usage-2.test.ts",
	// ✗ "sub.deleted invoice: entity consumable → Stripe cancel at period end →
	//   CREATES arrear invoice" — Invoice[0] expected $40.00, got $0.00. Also
	//   "…advance 1 month → cancel immediately → no invoice", Expected 1, got 2.
	"integration/billing/stripe-webhooks/subscription-deleted/subscription-deleted-invoice.test.ts",
	"integration/billing/stripe-webhooks/subscription-deleted/subscription-deleted-invoice-3.test.ts",
	"integration/billing/stripe-webhooks/subscription-deleted/subscription-deleted-invoice-2.test.ts",

	// ── GROUP B: individual bugs ────────────────────────────────────────────
	// ✗ "cancel end of cycle: downgrade then cancel (with default)"
	//   Setup leaves premium canceling + pro scheduled. After
	//   cancel_action: "cancel_end_of_cycle" on premium the customer has ONLY
	//   [premium:active]: the scheduled downgrade was dropped, premium was NOT
	//   marked canceling, and the default (free) was never scheduled.
	//   Deterministic — fails the same way solo, so not cross-file collision.
	"integration/billing/update-subscription/cancel/end-of-cycle/cancel-end-of-cycle.test.ts",
	"integration/billing/update-subscription/cancel/end-of-cycle/cancel-end-of-cycle-2.test.ts",
	// ✗ "legacy one-off rwf: prepaid one-off charges major units, not x100"
	//   Autumn holds the invoice at "draft" forever, and listing invoices on the
	//   SUB-ORG's own Stripe account returns [] — so no Stripe invoice is ever
	//   created for this attach. The failure is upstream of finalize/pay: either
	//   the sub-org has no usable Stripe connection under tw, or RWF price
	//   creation fails there. Next step is server-side, which tw does not forward.
	"integration/billing/legacy/attach/new/legacy-new-oneoff-zero-decimal.test.ts",
	// ✗ "create-schedule: now phase stays the exact active set across groups and
	//   future phases" — expect(received).toEqual(expected). Shape mismatch.
	//   The assertion now polls and names every row it saw, so the next run says
	//   which customer_products row is extra/missing.
	"integration/billing/create-schedule/phases/create-schedule-phases-active-set.test.ts",
	// ✗ "customer.subscription.created auto-sync: links product after external
	//   Stripe checkout completion" — "Checkout session did not produce a
	//   subscription"; the browser is left on checkout.stripe.com with the form
	//   unsubmitted. Pinning payment_method_types: ["card"] made it pass in
	//   isolation but NOT in a full core run. Ruled out so far: card fields ARE
	//   present and filled (they waitFor, so a miss would throw); submit IS
	//   clicked; waiting for Stripe to enable submit before clicking changes
	//   nothing; no decline text, no navigation, form still rendered.
	//   legacy-checkout-basic passes in the same run, so the shared automation is
	//   fine — something about THIS session (its "OR" express-payment block is
	//   the only visible difference) keeps the submit inert.
	//   Worth considering: the file's FIRST test already covers external-sub
	//   auto-sync via createStripeSubscriptionFromProduct and passes reliably, so
	//   this variant mostly exercises Stripe's own UI.
	"integration/billing/stripe-webhooks/subscription-created/sub-created-auto-sync.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "Scratch group for triaging a failing tw run",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 2,
};
