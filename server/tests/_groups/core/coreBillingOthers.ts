import type { TestGroup } from "../types";

export const coreBillingOthers: TestGroup = {
	name: "core-billing-others",
	description: "Core v2 billing others tests",
	tier: "core",
	paths: [
		"billing/multi-attach/basic",
		"billing/multi-attach/checkout/multi-attach-checkout-basic.test.ts",
		"billing/multi-attach/checkout/multi-attach-customize.test.ts",
		"billing/multi-attach/multi-attach-errors.test.ts",
		"billing/multi-attach/multi-attach-trial.test.ts",

		// Setup payment
		"billing/setup-payment",
	],
};
