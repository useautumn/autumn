import type { TestGroup } from "./types";

// Still failing after retry — under active triage.
//
// NOTE: the 8 "Test filter had no matches" crashes from the same run are NOT
// listed here — those files only exist locally (branch is ahead of origin), and
// tw workers fast-forward to the origin-resolved sha. Push the branch to fix.
const activeTempPaths = [
	// --- TRIGGER_SECRET_KEY: batch-transition task had no Trigger runner on tw.
	// Fixed by shouldRunTriggerTasksInline; re-run to confirm.
	"integration/licenses/billing/attach/attach-license-parent-stripe-product.test.ts",
	"integration/licenses/billing/attach/attach-parent-customized-license-switch.test.ts",
	"integration/licenses/billing/transitions/immediate-switch/attach-licenses-immediate-switch.test.ts",
	"integration/licenses/billing/transitions/immediate-switch/base-price-transitions/attach-base-price-transitions.test.ts",
	"integration/licenses/billing/transitions/immediate-switch/base-price-transitions/base-price-transition-edge-cases.test.ts",
	"integration/licenses/billing/transitions/immediate-switch/base-price-transitions/update-base-price-transitions.test.ts",
	"integration/licenses/billing/transitions/immediate-switch/item-transitions/free-item-transitions.test.ts",
	"integration/licenses/billing/transitions/immediate-switch/item-transitions/non-consumable-item-transition.test.ts",
	"integration/licenses/billing/transitions/immediate-switch/seat-customer-product-transition.test.ts",
	"integration/licenses/billing/update/update-license-customize-patch.test.ts",
	"integration/licenses/billing/update/update-license-version.test.ts",

	// --- "Can't have two fixed prices with the same interval"
	"integration/licenses/billing/update/update-preserves-license-items.test.ts",

	// --- validateProductItems.ts:470 throws
	"integration/billing/migrations-v2/update-plan-operation/customize/update-plan-op-scheduled-patch.test.ts",
	"integration/billing/migrations-v2/update-plan-operation/state-preservation/subscriptions/update-plan-op-states.test.ts",

	// --- browser/Playwright: payment-element iframe locator matched 2 elements
	"integration/billing/attach/invoice/attach-invoice-draft-deferred.test.ts",

	// --- licenses: remaining assertion failures
	"integration/licenses/billing/transitions/scheduled-switch/base-price-transitions/scheduled-base-price-transition.test.ts",
	"integration/licenses/billing/transitions/scheduled-switch/item-transitions/non-consumable-item-transition.test.ts",
	"integration/licenses/billing/transitions/scheduled-switch/item-transitions/reset-cycle-anchor-transition.test.ts",
	"integration/licenses/catalog-update/child-plan/catalog/child-and-parent-update.test.ts",
	"integration/licenses/catalog-update/child-plan/propagate-base-license-edge-cases.test.ts",
	"integration/licenses/catalog-update/child-plan/propagate/multiple-parent-versions.test.ts",
	"integration/licenses/catalog-update/license-catalog-edit-guards.test.ts",
	"integration/licenses/catalog-update/license-catalog-response.test.ts",

	// --- track: deductions not visible / timeouts
	"integration/balances/track/basic/track-deductions.test.ts",
	"integration/balances/track/basic/track-event-name.test.ts",
	"integration/balances/track/basic/track-paid-features.test.ts",

	// --- billing
	"integration/billing/legacy/attach/invoice/legacy-attach-invoice-mode.test.ts",
	"integration/billing/legacy/attach/invoice/payment-failure/legacy-attach-payment-failed.test.ts",
	"integration/billing/legacy/attach/new/legacy-new-oneoff-zero-decimal.test.ts",
	"integration/billing/migrations-v2/update-plan-operation/customize/update-plan-op-price.test.ts",
	"integration/billing/setup-payment/setup-payment-with-plan.test.ts",
	"integration/billing/stripe-webhooks/subscription-created/licenses/sub-created-license-variant-backsync.test.ts",
	"integration/billing/stripe-webhooks/subscription-created/sub-created-auto-sync.test.ts",
	"integration/billing/update-subscription/custom-plan/update-paid-features.test.ts",
	"integration/billing/update-subscription/custom-plan/update-paid-intervals.test.ts",

	// --- crud
	"integration/crud/plans/diffing/diffPlanV1.test.ts",
	"integration/crud/plans/versioning/migration-drafts/update-plan-migration-drafts.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "Still-failing suites from the low-concurrency rerun — triage",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 2,
};
