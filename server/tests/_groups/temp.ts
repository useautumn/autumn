import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Billing rollover regression suite (rollover carry-over fix)",
	tier: "domain",
	paths: [
		"integration/billing/attach/immediate-switch/immediate-switch-rollover.test.ts",
		"integration/billing/attach/scheduled-switch/scheduled-switch-rollover.test.ts",
		"integration/billing/attach/scheduled-switch/discounts/scheduled-switch-discounts-edge.test.ts",
		"integration/billing/create-schedule/create-schedule-basic.test.ts",
		"integration/billing/update-subscription/custom-plan/update-paid-prepaid-rollover.test.ts",
	],
};
