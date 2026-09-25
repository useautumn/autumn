import type { TestGroup } from "./types";

/** Scratch group for tw leftovers. Keep empty on trunk. */
const activeTempPaths: string[] = [
	// Entity caches now prewarmed; tracked balances survive, but overage invoices still return only $20.
	// Local sync-worker Redis failures and invoice DB-snapshot timing remain under review.
	"integration/billing/stripe-webhooks/invoice-created/invoice-created-per-entity-consumable.test.ts",
	"integration/billing/stripe-webhooks/invoice-created/invoice-created-per-entity-consumable-advanced.test.ts",
	// Allocated deduction is followed by webhook cache flushes and a zero balance.
	"integration/billing/update-subscription/cancel/immediately/cancel-immediately-billing.test.ts",
	// Variant has resources before attach; concurrent cases also mutate the same org config.
	"integration/crud/plans/variants/stripe-resource-carryover.test.ts",
	// Entity trial invoice count is two instead of three; the cause still needs review.
	"integration/billing/stripe-webhooks/invoice-created/invoice-created-consumable-trial.test.ts",
	// Paid overage updates can return the original balance and zero usage.
	"integration/balances/update/usage/allocated/update-usage-paid-allocated.test.ts",
	// Setup reads DB after a fixed 2s track wait; local sync readiness remains unresolved.
	"integration/billing/pooled-balances/update/customize-pooled-balance.test.ts",
	// Coupon now targets messages; focused run bills $0 vs $12 after usage sync arrives past reset.
	// Customer-level flush needs a customer cache manifest; only the entity view was populated.
	"integration/billing/stripe-webhooks/subscription-deleted/subscription-deleted-invoice-discounts.test.ts",
	// Test awaits stored charge rows; production fallback can still over-credit before storage completes.
	"integration/licenses/billing/discounts/license-discount-composition.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "local tw triage — keep empty on trunk",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 4,
};
