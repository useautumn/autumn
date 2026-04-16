import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Create schedule unit tests",
	tier: "domain",
	paths: [
		"unit/billing/create-schedule/create-schedule-params.spec.ts",
		"unit/billing/create-schedule/compute-create-schedule-plan.spec.ts",
		"unit/billing/create-schedule/normalize-create-schedule-phases.spec.ts",
		"unit/billing/create-schedule/validate-create-schedule-phase-plans.spec.ts",
		"integration/billing/create-schedule/create-schedule-basic.test.ts",
	],
};
