import type { TestGroup } from "./types";

// Real failures from the 2026-07-24 low-concurrency rerun (rate-limit noise
// excluded) — mostly invoice-total mismatches, under triage.
const activeTempPaths = [
	"integration/billing/legacy/attach/update-quantity/legacy-update-quantity.test.ts",
	"integration/billing/legacy/attach/upgrade/legacy-upgrade-merged.test.ts",
	"integration/billing/update-subscription/custom-plan/update-paid-features.test.ts",
	"integration/billing/update-subscription/custom-plan/update-paid-basic.test.ts",
	"integration/billing/update-subscription/custom-plan/update-paid-prepaid.test.ts",
	"integration/billing/update-subscription/params/recalculate-balances/update-quantity-prepaid-overage.test.ts",
	"integration/crud/plans/variants/stripe-resource-carryover.test.ts",
	"integration/licenses/billing/transitions/immediate-switch/item-transitions/free-item-transitions.test.ts",
	"integration/licenses/billing/transitions/immediate-switch/item-transitions/non-consumable-item-transition.test.ts",
	"integration/licenses/billing/transitions/scheduled-switch/item-transitions/non-consumable-item-transition.test.ts",
	"integration/licenses/catalog-update/license-catalog-edit-guards.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "Still-failing suites from the low-concurrency rerun — triage",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 2,
};
