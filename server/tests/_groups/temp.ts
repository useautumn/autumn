import type { TestGroup } from "./types";

/** Scratch group for tw leftovers. Keep empty on trunk. */
const activeTempPaths: string[] = [
	"integration/crud/plans/update/in-place/in-place-isolation.test.ts",
	"integration/crud/plans/update/update-plan-allocated-v1-compat.test.ts",
	// Deferred logic review: loading another entity overwrites shared tracked usage.
	"integration/billing/stripe-webhooks/invoice-created/invoice-created-per-entity-consumable.test.ts",
	"integration/billing/stripe-webhooks/invoice-created/invoice-created-per-entity-consumable-advanced.test.ts",
	// Deferred logic review: continuous events postpone the debounce flush past assertions.
	"integration/balances/lock/check-with-lock-credit-system.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "local tw triage — keep empty on trunk",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 4,
};
