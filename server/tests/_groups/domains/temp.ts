import type { TestGroup } from "../types";

export const temp: TestGroup = {
	name: "temp",
	description: "Tests created in this current session",
	tier: "domain",
	paths: [
		"integration/billing/attach/immediate-switch/immediate-switch-misc.test.ts",
		"integration/billing/attach/new-plan/new-plan-misc.test.ts",
		"integration/billing/update-subscription/free-trial/update-trial-misc.test.ts",
		"integration/billing/update-subscription/update-quantity/update-quantity-misc.test.ts",
	],
};
