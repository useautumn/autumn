import type { TestGroup } from "./types";

export const core: TestGroup = {
	name: "core",
	description:
		"Critical flows that must pass: basic attach, balance operations, CRUD, unit tests",
	tier: "core",
	paths: [
		// ── Balance: Check ──
		"integration/balances/check/check-basic.test.ts",
		"balances/check/credit-systems",
		"balances/check/send-event",

		// ── Balance: Track ──
		"balances/track/basic",
		"balances/track/concurrency",
		"balances/track/credit-systems",
		"balances/track/entity-balances",
		"balances/track/entity-products",
		"balances/track/negative",
		"balances/track/paid-allocated",
		"integration/balances/track/track-misc.test.ts",

		// ── Balance: Update ──
		"integration/balances/update/balance/update-balance-basic.test.ts",

		// ── Legacy Attach ──
		"integration/billing/legacy/attach/attach-new-billing-subscription.test.ts",
		"integration/billing/legacy/attach/attach-misc.test.ts",
		"integration/billing/legacy/attach/downgrade/legacy-downgrade-merged-schedule.test.ts",
		"integration/billing/legacy/attach/group/legacy-group-merged.test.ts",
		"integration/billing/legacy/attach/invoice/legacy-attach-invoice-mode.test.ts",
		"integration/billing/legacy/attach/new/legacy-new-merged.test.ts",
		"integration/billing/legacy/attach/separate/legacy-separate.test.ts",
		"integration/billing/legacy/attach/trial/legacy-trial.test.ts",
		"integration/billing/legacy/attach/update-quantity/legacy-update-quantity.test.ts",
		"integration/billing/legacy/attach/upgrade/legacy-upgrade.test.ts",
	],
};
