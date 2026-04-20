import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Failed tests to triage and fix",
	tier: "domain",
	paths: [
		"integration/balances/track/basic/track-event-name.test.ts",
		"integration/balances/track/basic/track-credit-system.test.ts",
		"integration/balances/auto-topup/auto-topup-edge-cases.test.ts",
		"integration/balances/reset/persist-free-overage-on.test.ts",
		"integration/balances/lock/check-with-lock-expiry.test.ts",
	],
};
