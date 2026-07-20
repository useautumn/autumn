import type { TestGroup } from "./types";

// Still failing after retry on the 2026-07-20 rerun — under active triage.
const activeTempPaths = [
	"integration/licenses/catalog-update/license-catalog-edit-guards.test.ts",
	"integration/licenses/catalog-update/license-catalog-response.test.ts",
	"integration/licenses/catalog-update/license-sandbox-copy.test.ts",
	"integration/licenses/billing/checkout/stripe-checkout-license-quantity.test.ts",
	"integration/crud/customers/get-customer-entity-rollover-granted.test.ts",
	"integration/crud/plans/create-plan-basic.test.ts",
	"integration/crud/plans/variants/lifecycle.test.ts",
	"integration/crud/plans/variants/interval-family.test.ts",
	"integration/crud/plans/variants/reset-tier-ladder.test.ts",
	"integration/balances/lock/check-with-lock-credit-system.test.ts",
	"integration/balances/track/basic/track-tokens.test.ts",
	"integration/billing/update-subscription/custom-plan/update-paid-prepaid.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "Still-failing suites from full-run retry — under triage",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 2,
};
