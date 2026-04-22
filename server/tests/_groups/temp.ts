import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Failed tests to triage and fix",
	tier: "domain",
	paths: [
		"balances/track/entity-balances/track-entity-balances4.test.ts",
		"balances/track/entity-balances/track-entity-balances5.test.ts",
		"balances/track/concurrency/concurrent-track6.test.ts",
	],
};
