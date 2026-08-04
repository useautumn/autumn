import type { TestGroup } from "./types";

// Failures from `bun tw core` (runs msexci3e-dlq27t / msextjqb-ur56y1, branch
// fix/tw-flakiness) that are NOT settle/timing flakes — each still failed after
// 45-150s of assertion polling. Two groups; clear entries as they're fixed.
//
// GROUP 2 — track-vs-billing-action race (one shared root cause).
//   Symptom is always the same shape: the asserted balance comes back as the
//   FULL, un-deducted total, and polling never recovers it.
//   Mechanism: `track` deducts in Redis and queues a sync; a billing action
//   (attach / update) then bumps cache_version; syncItemV4.ts:50-58 resolves the
//   resulting CACHE_VERSION_MISMATCH by calling deleteCachedFullCustomer — so a
//   deduction still living only in Redis is DISCARDED rather than replayed.
//   Not just a test problem: in production a track racing an attach silently
//   drops usage (unbilled revenue). Fix belongs in the sync conflict path.
//
// GROUP 3 — individually genuine bugs, unrelated to each other.
const activeTempPaths: string[] = [
	// ── GROUP 2: track-vs-billing-action race ───────────────────────────────
	// ✗ "legacy-upgrade-usage 1: consumable upgrades Pro → Premium → Growth"
	//   Expected: -200, Received: 100 (also "…2: monthly → annual interval
	//   change", Expected: -100). Tracks 150/200/300 words around attaches.
	"integration/billing/legacy/attach/upgrade/legacy-upgrade-usage.test.ts",
	// ✗ "prepaid: add included usage" — Expected: 100, Received: 200.
	//   Also "prepaid: change price and billing units".
	"integration/billing/update-subscription/custom-plan/update-paid-prepaid.test.ts",
	// ✗ "update-quantity-prepaid-overage: increase quantity with balance
	//   recalculation" — Expected: 0, Received: 300. Also the "without balance
	//   recalculation" variant.
	"integration/billing/update-subscription/params/recalculate-balances/update-quantity-prepaid-overage.test.ts",

	// ── GROUP 3: individual bugs ────────────────────────────────────────────
	// ✗ "legacy one-off rwf: prepaid one-off charges major units, not x100"
	//   Expected: "paid", Received: "draft". Already polls 120s via
	//   waitForCustomerInvoiceStatus — the zero-decimal (RWF) invoice on a
	//   sub-org never leaves draft.
	"integration/billing/legacy/attach/new/legacy-new-oneoff-zero-decimal.test.ts",
	// ✗ "legacy-inv-mode 1: new subscription" — Create stripe subscription failed
	//   (23505): duplicate key value violates unique constraint
	//   "subscriptions_stripe_id_key". A real collision, not lateness.
	"integration/billing/legacy/attach/invoice/legacy-attach-invoice-mode.test.ts",
	// ✗ "create-schedule: now phase stays the exact active set across groups and
	//   future phases" — expect(received).toEqual(expected). Shape mismatch;
	//   needs reading, not waiting.
	"integration/billing/create-schedule/phases/create-schedule-phases.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "Scratch group for triaging a failing tw run",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 2,
};
