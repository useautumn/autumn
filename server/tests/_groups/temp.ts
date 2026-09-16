import type { TestGroup } from "./types";

/** Scratch group for tw leftovers. Keep empty on trunk. */
const activeTempPaths: string[] = [
	// Cleanup deletes customers while invoice.paid is still writing their invoices.
	"integration/catalog-v2/plans/aliases/alias-billing-endpoints.test.ts",
	"integration/crud/plans/update/in-place/in-place-isolation.test.ts",
	"integration/crud/plans/update/update-plan-allocated-v1-compat.test.ts",
	// Deferred logic review: loading another entity overwrites shared tracked usage.
	"integration/billing/stripe-webhooks/invoice-created/invoice-created-per-entity-consumable.test.ts",
	"integration/billing/stripe-webhooks/invoice-created/invoice-created-per-entity-consumable-advanced.test.ts",
	// Deferred logic review: continuous events postpone the debounce flush past assertions.
	"integration/balances/lock/check-with-lock-credit-system.test.ts",
	// Deferred logic review: allocated deduction is followed by webhook cache flushes and a zero balance.
	"integration/billing/update-subscription/cancel/immediately/cancel-immediately-billing.test.ts",
	// Deferred logic review: subscription update reads before the queued balance sync finishes.
	"integration/billing/update-subscription/custom-plan/update-free-to-paid.test.ts",
	// Deferred logic review: delivered webhooks include entity_id: null; previews omit it.
	"integration/billing/migrations-v2/batch-migrations/replace-items/batch-replace-item-events-webhooks.test.ts",
	// Deferred logic review: scheduled free-plan activation is emitted as updated, not activated.
	"integration/billing/autumn-webhooks/billing-updated/billing-updated-subscription-deleted.test.ts",
	// Deferred fixture review: a seeded referral program has no required received_by value.
	"integration/catalog-v2/plans/update/rename-plan-refs.test.ts",
	// Reproduces in a single local case: the variant already has Stripe resources before attach.
	"integration/crud/plans/variants/stripe-resource-carryover.test.ts",
	// Deferred logic review: subscription refresh can invalidate tracked usage before its DB flush.
	"integration/billing/stripe-webhooks/invoice-created/invoice-created-consumable-trial.test.ts",
	// Setup and migration both emit scenario "new"; the matcher doesn't distinguish them.
	"integration/billing/autumn-webhooks/batch-migration/batch-migration-products-updated.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "local tw triage — keep empty on trunk",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 4,
};
