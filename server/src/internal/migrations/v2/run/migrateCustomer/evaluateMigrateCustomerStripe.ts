import type {
	AutumnBillingPlan,
	BillingPlan,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MigrateCustomerContext } from "@/internal/migrations/v2/operations/types/index.js";

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
 * mutations (priced add_items, expire_plans with end_of_cycle, etc.).
 */
export const evaluateMigrateCustomerStripe = async ({
	ctx,
	context,
	billingContexts,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	context: MigrateCustomerContext;
	billingContexts: UpdateSubscriptionBillingContext[];
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<BillingPlan> => {
	void ctx;
	void context;
	void billingContexts;
	// TODO: call evaluateStripeBillingPlan + run no-charges guard.
	return { autumn: autumnBillingPlan, stripe: {} };
};
