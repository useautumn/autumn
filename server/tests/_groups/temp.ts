import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Failed tests to triage and fix",
	tier: "domain",
	paths: [
		"balances/track/breakdown/track-entity-breakdown1.test.ts",
		"balances/track/breakdown/track-breakdown4.test.ts",
		"balances/track/breakdown/track-breakdown3.test.ts",
		"balances/track/legacy/track-legacy2.test.ts",
		"balances/track/legacy/track-legacy3.test.ts",
		"balances/check/send-event/send-event1.test.ts",
		"balances/track/paid-allocated/track-paid-allocated7.test.ts",
		"balances/check/loose/loose-expiry.test.ts",
		"balances/check/loose/loose-expiry-cross-version.test.ts",
		"integration/balances/track/allocated-invoice/allocated-invoice-advances.test.ts",
		"integration/balances/track/basic/track-negative.test.ts",
		"integration/balances/reset/get-customer-reset.test.ts",
		"integration/balances/lock/check-with-lock-concurrent-stress.test.ts",
		"integration/balances/check/spend-limit/check-customer-spend-limit.test.ts",
	],
};
