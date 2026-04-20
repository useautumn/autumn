import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Failed tests to triage and fix",
	tier: "domain",
	paths: [
		"integration/balances/auto-topup/auto-topup-concurrent.test.ts",
		"integration/balances/auto-topup/auto-topup-basic.test.ts",
		"integration/balances/auto-topup/auto-topup-edge-cases.test.ts",
		"integration/balances/auto-topup/auto-topup-failure-modes.test.ts",
	],
};
