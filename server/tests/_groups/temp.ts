import type { TestGroup } from "./types";

/** Confirmed local failures after `bun t temp` + retry (2026-08-24). */
const activeTempPaths: string[] = [
	// billing
	"integration/billing/migrations-v2/batch-migrations/batch-lane-parity.test.ts",
	"integration/billing/pooled-balances/unlimited/pooled-balance-unlimited.test.ts",
	"integration/billing/stripe-webhooks/subscription-created/licenses/sub-created-license-variant-backsync.test.ts",
	"integration/billing/update-subscription/cancel/end-of-cycle/cancel-end-of-cycle.test.ts",
	// catalog-v2 — aliases / validation
	"integration/catalog-v2/plans/aliases/alias-catalog-endpoints.test.ts",
	"integration/catalog-v2/plans/validation/free-trial-validation.test.ts",
	// catalog-v2 — create / versions
	// (fixed 2026-08-24: stripe-init, version-identity-stripe-reuse, default-version-attach, plan-versions)
	// catalog-v2 — licenses
	"integration/catalog-v2/plans/licenses/mix/two-parents-split-new-version.test.ts",
	"integration/catalog-v2/plans/licenses/mix/versioning-collisions.test.ts",
	"integration/catalog-v2/plans/licenses/preview/license-parent-versioning.test.ts",
	"integration/catalog-v2/plans/licenses/propagated/follow-new-parent-version.test.ts",
	"integration/catalog-v2/plans/licenses/propagated/follow-version-overlays.test.ts",
	"integration/catalog-v2/plans/licenses/propagated/follower-mint-active.test.ts",
	"integration/catalog-v2/plans/migrations/licenses/versioning/parent-propagate-versioning-drafts.test.ts",
	// catalog-v2 — preview / update
	"integration/catalog-v2/plans/preview/changes/changes-base-price.test.ts",
	"integration/catalog-v2/plans/preview/changes/changes-billing-control-lanes.test.ts",
	"integration/catalog-v2/plans/preview/changes/changes-items.test.ts",
	"integration/catalog-v2/plans/preview/preview-state-versioning.test.ts",
	"integration/catalog-v2/plans/update/rename-plan-refs.test.ts",
	// crud / licenses billing
	"integration/crud/customers/get-customer-invoice-previews.test.ts",
	"integration/licenses/billing/transitions/immediate-switch/attach-licenses-immediate-switch.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "Confirmed local failures — fix outdated test logic vs server behavior",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 2,
};
