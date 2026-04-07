import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Billing cycle anchor tests (attach + update subscription)",
	tier: "domain",
	paths: [
		// Attach — reset ("now")
		"integration/billing/attach/params/billing-cycle-anchor/billing-cycle-anchor-reset.test.ts",
		"integration/billing/attach/params/billing-cycle-anchor/billing-cycle-anchor-reset-entities.test.ts",
		"integration/billing/attach/params/billing-cycle-anchor/anchor-reset-refund/anchor-reset-no-carry-over.test.ts",
		"integration/billing/attach/params/billing-cycle-anchor/anchor-reset-refund/anchor-reset-with-carry-over.test.ts",

		// Attach — scheduled (all tests skipped — scheduled anchor not yet supported)
		// "integration/billing/attach/params/billing-cycle-anchor/billing-cycle-anchor-schedule.test.ts",
		// "integration/billing/attach/params/billing-cycle-anchor/billing-cycle-anchor-schedule-entities.test.ts",

		// Attach — new plan (tests 1 & 2 skipped, test 3 "now" is active)
		"integration/billing/attach/params/billing-cycle-anchor/billing-cycle-anchor-new-plan.test.ts",
		"integration/billing/attach/params/billing-cycle-anchor/billing-cycle-anchor-new-plan-entities.test.ts",

		// Attach — line items & errors
		"integration/billing/attach/invoice-line-items/billing-cycle-anchor-reset-line-items.test.ts",
		"integration/billing/attach/errors/attach-billing-cycle-anchor-errors.test.ts",

		// Update subscription — reset ("now")
		"integration/billing/update-subscription/params/billing-cycle-anchor/update-sub-anchor-reset-no-partial-refund.test.ts",
		"integration/billing/update-subscription/params/billing-cycle-anchor/update-sub-anchor-reset-errors.test.ts",
		"integration/billing/update-subscription/params/billing-cycle-anchor/update-sub-anchor-reset-with-changes.test.ts",

		// Update subscription — anchor drift
		"integration/billing/update-subscription/custom-plan/update-free-to-free-anchor-drift.test.ts",
	],
};
