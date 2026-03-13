import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Default product behavior verification tests",
	tier: "domain",
	paths: [
		// Cancel immediately with default tests
		"integration/billing/attach/checkout/autumn-checkout/autumn-checkout-basic.test.ts",
		"integration/billing/attach/immediate-switch/paid-features/immediate-switch-prepaid-no-options-basic.test.ts",
		"integration/billing/attach/immediate-switch/paid-features/immediate-switch-prepaid-no-options-advanced.test.ts",
		"integration/billing/attach/free-trial/override/trial-override-basic.test.ts",
		"integration/billing/attach/free-trial/override/trial-override-merge.test.ts",
		"integration/billing/attach/free-trial/trial-upgrade.test.ts",
		"integration/billing/attach/free-trial/trial-entity-upgrade.test.ts",
	],
};
