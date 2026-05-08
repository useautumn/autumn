import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "patch-style custom plan update coverage",
	tier: "domain",
	paths: [
		"integration/billing/update-subscription/custom-plan-patch/patch-update-items.test.ts",
		"integration/billing/update-subscription/custom-plan-patch/patch-update-price.test.ts",
		"integration/billing/update-subscription/custom-plan-patch/patch-update-paid-features.test.ts",
		"integration/billing/update-subscription/custom-plan-patch/patch-update-items-carry-usage.test.ts",
		"integration/billing/update-subscription/custom-plan-patch/patch-update-items-carry-rollover.test.ts",
		"integration/billing/update-subscription/custom-plan-patch/patch-update-with-others.test.ts",
	],
};
