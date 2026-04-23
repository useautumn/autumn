import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Failed tests to triage and fix",
	tier: "domain",
	paths: [
		"balances/check/loose/loose-2.test.ts",
		"balances/check/loose/entities/entity-loose-2.test.ts",
		// "balances/track/loose/loose-unlimited.test.ts",
		// "balances/track/concurrency/concurrent-track6.test.ts",
		// "integration/balances/lock/check-with-lock-concurrent-stress.test.ts",
	],
};
