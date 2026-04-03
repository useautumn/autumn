import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Billing cycle anchor reset tests",
	tier: "domain",
	paths: [
		"integration/billing/attach/params/billing-cycle-anchor/billing-cycle-anchor-reset.test.ts",
		"integration/billing/attach/params/billing-cycle-anchor/billing-cycle-anchor-reset-entities.test.ts",
		"integration/billing/attach/params/billing-cycle-anchor/billing-cycle-anchor-new-plan.test.ts",
		"integration/billing/attach/params/billing-cycle-anchor/billing-cycle-anchor-new-plan-entities.test.ts",
		"integration/billing/attach/invoice-line-items/billing-cycle-anchor-reset-line-items.test.ts",
		"integration/billing/attach/errors/attach-billing-cycle-anchor-errors.test.ts",
	],
};
