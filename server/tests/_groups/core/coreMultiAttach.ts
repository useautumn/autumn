import type { TestGroup } from "../types";

export const coreMultiAttach: TestGroup = {
	name: "core-multi-attach",
	description: "Core v2 multi-attach tests",
	tier: "core",
	paths: [
		"billing/multi-attach/basic",
		"billing/multi-attach/checkout/multi-attach-checkout-basic.test.ts",
		"billing/multi-attach/checkout/multi-attach-customize.test.ts",
		"billing/multi-attach/multi-attach-errors.test.ts",
		"billing/multi-attach/multi-attach-trial.test.ts",
	],
};
