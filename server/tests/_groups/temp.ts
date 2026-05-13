import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "failed balance tests from retry run",
	tier: "domain",
	paths: [
		"balances/track/entity-balances/track-entity-balances6.test.ts",
		"integration/balances/track/track-misc.test.ts",
		"integration/balances/lock/postgres/check-with-lock-postgres-rollovers.test.ts",
		"integration/balances/lock/postgres/check-with-lock-postgres-edge-cases.test.ts",
		"integration/balances/lock/check-with-lock-edge-cases.test.ts",
	],
};
