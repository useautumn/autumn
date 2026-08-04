import type { TestGroup } from "./types";

// Genuine bugs surfaced by `bun tw core` (run msexci3e-dlq27t, branch
// fix/tw-flakiness). These are NOT settle/timing flakes — each was still
// failing after 45-120s of assertion polling. Clear when fixed.
const activeTempPaths: string[] = [
	// ✗ "legacy-upgrade-usage 1: consumable upgrades Pro → Premium → Growth"
	//   and "…2: monthly → annual interval change" — Expected: -100, Received: 100.
	//   Track fired right after an attach is lost: the deduction never lands, so
	//   this is a track-vs-billing-action race, not lateness (polling can't
	//   recover a dropped deduction).
	"integration/billing/legacy/attach/upgrade/legacy-upgrade-usage.test.ts",
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
