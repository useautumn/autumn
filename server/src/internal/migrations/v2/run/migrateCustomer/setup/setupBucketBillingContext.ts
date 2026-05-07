import { LATEST_BILLING_VERSION } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupStripeBillingContext } from "@/internal/billing/v2/providers/stripe/setup/setupStripeBillingContext.js";
import type { MigrateCustomerBillingContext } from "@/internal/migrations/v2/operations/types/migrateCustomerBillingContext.js";
import type { CustomerLevelContext } from "./setupCustomerLevel.js";
import type { SubscriptionBucket } from "./types.js";

/**
 * Per-bucket setup. Reuses the customer-level FullCustomer and fetches
 * Stripe state for THIS bucket's subscription only (skipped entirely
 * when `bucket.stripe_subscription_id === null` — the entitlement-only
 * / DB-only path).
 *
 * Returns a `MigrateCustomerBillingContext` ready for `processOperations`
 * → `evaluateMigrateCustomerStripe` → `executeMigrateCustomerPlan`.
 */
export const setupBucketBillingContext = async ({
	ctx,
	customerLevel,
	bucket,
}: {
	ctx: AutumnContext;
	customerLevel: CustomerLevelContext;
	bucket: SubscriptionBucket;
}): Promise<MigrateCustomerBillingContext> => {
	const { fullCustomer, migration, scope_id, prepared_state } = customerLevel;

	const skipStripe =
		bucket.stripe_subscription_id === null ||
		migration.no_billing_changes === true;

	// Use the first matched cusproduct in the bucket as the target so
	// `setupStripeBillingContext` fetches the right sub + schedule.
	const targetCustomerProduct = bucket.matches[0]?.cusProduct;

	const stripeBilling = skipStripe
		? {
				stripeCustomer: undefined,
				stripeSubscription: undefined,
				stripeSubscriptionSchedule: undefined,
				stripeDiscounts: undefined,
				paymentMethod: undefined,
			}
		: await setupStripeBillingContext({
				ctx,
				fullCustomer,
				targetCustomerProduct,
			});

	return {
		fullCustomer,
		fullProducts: [],
		featureQuantities: [],
		currentEpochMs: Date.now(),
		billingCycleAnchorMs: "now",
		resetCycleAnchorMs: "now",
		billingVersion: LATEST_BILLING_VERSION,
		skipBillingChanges: migration.no_billing_changes === true,

		stripeCustomer: stripeBilling.stripeCustomer,
		stripeSubscription: stripeBilling.stripeSubscription,
		stripeSubscriptionSchedule: stripeBilling.stripeSubscriptionSchedule,
		stripeDiscounts: stripeBilling.stripeDiscounts,
		paymentMethod: stripeBilling.paymentMethod,

		// Migration-specific
		migration,
		scope_id,
		prepared_state,
		operations: migration.operations?.customer ?? {},
		projected_cusproducts: fullCustomer.customer_products,
	};
};
