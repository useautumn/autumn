import type { AutumnBillingPlan, BillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MigrateCustomerBillingContext } from "@/internal/migrations/v2/operations/types/index.js";

/**
 * Build the StripeBillingPlan from a computed AutumnBillingPlan and
 * enforce the no-charges guard:
 *  - throw on `invoiceAction` / `invoiceItemsAction` / `refundAction`
 *  - reject `subscriptionAction` params that would create proration
 *    invoice items
 *
 * Skipped entirely when `mode === "no_changes"`.
 *
 * STUB: lands when the per-op processors emit Stripe-relevant
 * mutations (priced upsert_items, expire_plans with end_of_cycle, etc.).
 */
export const evaluateMigrateCustomerStripe = async ({
	ctx,
	billingContext,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	billingContext: MigrateCustomerBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<BillingPlan> => {
	void ctx;
	void billingContext;
	// TODO: call evaluateStripeBillingPlan + run no-charges guard.
	return { autumn: autumnBillingPlan, stripe: {} };
};
