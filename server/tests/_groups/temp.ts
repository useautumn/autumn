import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Failed tests from billing V2 run",
	tier: "domain",
	paths: [
		"integration/billing/multi-attach/customize/multi-attach-customize-addons.test.ts",
		"integration/billing/update-subscription/custom-plan/update-paid-tier-behavior.test.ts",
		"integration/billing/update-subscription/invoice-line-items/update-quantity-line-items.test.ts",
	],
};
