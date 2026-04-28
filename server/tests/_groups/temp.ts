import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Failed tests to triage and fix",
	tier: "domain",
	paths: [
		"integration/balances/check/spend-limit/check-customer-spend-limit.test.ts",
		"integration/balances/track/basic/track-event-name.test.ts",
		"integration/balances/track/track-misc.test.ts",
		"balances/track/entity-balances/track-entity-balances6.test.ts",
		"balances/track/entity-balances/track-entity-balances7.test.ts",
	],
};
