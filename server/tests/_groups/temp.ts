import type { TestGroup } from "./types";

/** Scratch group for tw leftovers. Keep empty on trunk. */
const activeTempPaths: string[] = [
	// Confirmed locally: loading another entity overwrites shared tracked usage before sync.
	"integration/billing/stripe-webhooks/invoice-created/invoice-created-per-entity-consumable.test.ts",
	"integration/billing/stripe-webhooks/invoice-created/invoice-created-per-entity-consumable-advanced.test.ts",
	// Deferred fixture review: consumable-only coupon may select the base price; $20 billed vs $25 expected.
	// Other three discount cases pass locally with the pre-reset flush; confirm the coupon's product ID.
	"integration/billing/stripe-webhooks/invoice-created/invoice-created-consumable-discounts.test.ts",
	// Allocated deduction is followed by webhook cache flushes and a zero balance.
	"integration/billing/update-subscription/cancel/immediately/cancel-immediately-billing.test.ts",
	// Deferred logic review: delivered webhooks include entity_id: null; previews omit it.
	"integration/billing/migrations-v2/batch-migrations/replace-items/batch-replace-item-events-webhooks.test.ts",
	// Deferred logic review: scheduled free-plan activation is emitted as updated, not activated.
	"integration/billing/autumn-webhooks/billing-updated/billing-updated-subscription-deleted.test.ts",
	// Variant has resources before attach; concurrent cases also mutate the same org config.
	"integration/crud/plans/variants/stripe-resource-carryover.test.ts",
	// Entity trial invoice count is two instead of three; the cause still needs review.
	"integration/billing/stripe-webhooks/invoice-created/invoice-created-consumable-trial.test.ts",
	// Setup and migration both emit scenario "new"; the matcher doesn't distinguish them.
	"integration/billing/autumn-webhooks/batch-migration/batch-migration-products-updated.test.ts",
	// Paid overage updates can return the original balance and zero usage.
	"integration/balances/update/usage/allocated/update-usage-paid-allocated.test.ts",
	// Fixture submits the same plan twice within one group and scope.
	"integration/billing/multi-attach/customize/multi-attach-customize.test.ts",
	// Setup reads DB after a fixed 2s track wait; local sync readiness remains unresolved.
	"integration/billing/pooled-balances/update/customize-pooled-balance.test.ts",
	// Consumable-only coupon uses the same ambiguous price selector as invoice-created discounts.
	"integration/billing/stripe-webhooks/subscription-deleted/subscription-deleted-invoice-discounts.test.ts",
	// Deferred assertion review: trials expire 30s before GET, which excludes expired products.
	"integration/billing/stripe-webhooks/test-clock-ready/test-clock-ready-expires-trial.test.ts",
	// Archived variant restoration preview lacks the expected previous archived attribute.
	"integration/catalog-v2/plans/remove/remove-plans-archived.test.ts",
	// Passes locally; cloud refund falls back to catalog math when stored charge data is unavailable.
	"integration/licenses/billing/discounts/license-discount-composition.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "local tw triage — keep empty on trunk",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 4,
};
