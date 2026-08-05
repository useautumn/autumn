import type { TestGroup } from "./types";

// Remaining `bun tw core` failures on branch fix/tw-flakiness (run
// msfyra7y-tk02tf, 7 files — down from 12). Every entry here still failed
// after 45s of assertion polling, so none of these are settle/timing flakes.
//
// GROUP A — track-vs-billing-action race (one shared root cause).
//   A `track` deducts in Redis and queues a sync; a billing action (attach /
//   update / cancel) then bumps cache_version; syncItemV4.ts:50-58 resolves the
//   CACHE_VERSION_MISMATCH by calling deleteCachedFullCustomer — so a deduction
//   still living only in Redis is DISCARDED rather than replayed. The asserted
//   amount comes back as the full, un-deducted total.
//   Not just a test problem: in production a track racing an attach silently
//   drops usage (unbilled revenue). The fix belongs in the sync conflict path.
//   These flip between runs — which file fails depends on which worker races.
//
// GROUP B — individually genuine bugs, unrelated to each other.
const activeTempPaths: string[] = [
	// ── GROUP A: track-vs-billing-action race ───────────────────────────────
	// ✗ "scheduled-switch-consumable 3: premium with consumable overage,
	//   downgrade to pro" — Invoice[0] expected $30.00, got $20.00.
	"integration/billing/attach/scheduled-switch/scheduled-switch-consumable.test.ts",
	// ✗ "legacy-upgrade-usage 2: monthly → annual interval change"
	//   Expected: -50, Received: 100 (the deduction never lands).
	"integration/billing/legacy/attach/upgrade/legacy-upgrade-usage.test.ts",
	// ✗ "sub.deleted invoice: entity consumable → Stripe cancel at period end →
	//   CREATES arrear invoice" — Invoice[0] expected $40.00, got $0.00.
	"integration/billing/stripe-webhooks/subscription-deleted/subscription-deleted-invoice.test.ts",

	// ── GROUP B: individual bugs ────────────────────────────────────────────
	// ✗ "legacy one-off rwf: prepaid one-off charges major units, not x100"
	//   Expected: "paid", Received: "draft". The zero-decimal (RWF) invoice on a
	//   sub-org never leaves draft, after 120s of polling.
	"integration/billing/legacy/attach/new/legacy-new-oneoff-zero-decimal.test.ts",
	// ✗ "create-schedule: now phase stays the exact active set across groups and
	//   future phases" — expect(received).toEqual(expected). Shape mismatch.
	"integration/billing/create-schedule/phases/create-schedule-phases.test.ts",
	// ✗ "customer.subscription.created auto-sync: links product after external
	//   Stripe checkout completion" — bare "Test failed", no assertion message.
	"integration/billing/stripe-webhooks/subscription-created/sub-created-auto-sync.test.ts",
	// ✗ "cancel end of cycle: downgrade then cancel (with default)" — free
	//   product never reaches `scheduled`.
	"integration/billing/update-subscription/cancel/end-of-cycle/cancel-end-of-cycle.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "Scratch group for triaging a failing tw run",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 2,
};
