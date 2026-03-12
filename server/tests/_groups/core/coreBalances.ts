import type { TestGroup } from "../types";

export const coreBalances: TestGroup = {
	name: "core-balances",
	description: "Core balance check, track, and update tests",
	tier: "core",
	paths: [
		// ── Check ──
		"integration/balances/check/check-basic.test.ts",
		"balances/check/credit-systems",
		"balances/check/send-event",
		"balances/check/misc",
		"integration/balances/check/spend-limit/check-entity-product-spend-limit.test.ts",
		"integration/balances/check/spend-limit/check-customer-spend-limit.test.ts",

		// ── Track ──
		"balances/track/basic",
		"balances/track/allocated",
		"balances/track/breakdown",
		"balances/track/concurrency",
		"balances/track/credit-systems",
		"balances/track/entity-balances",
		"balances/track/entity-products",
		"balances/track/negative",
		"balances/track/paid-allocated",
		"integration/balances/track/track-misc.test.ts",
		"integration/balances/track/spend-limit/track-entity-product-spend-limit.test.ts",
		"integration/balances/track/spend-limit/track-customer-spend-limit.test.ts",

		// ── Lock ──
		"integration/balances/lock/basic",
		"integration/balances/lock/postgres",
		"integration/balances/lock/check-with-lock-credit-system.test.ts",
		"integration/balances/lock/check-with-lock-edge-cases.test.ts",

		// ── Update ──
		"integration/balances/update/balance/update-balance-basic.test.ts",

		// ── Usage ──
		"integration/balances/update/usage/update-usage-basic.test.ts",
		"integration/balances/update/usage/update-usage-paid-allocated.test.ts",
	],
};
