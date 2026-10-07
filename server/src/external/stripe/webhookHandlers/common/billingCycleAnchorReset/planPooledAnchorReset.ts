import { secondsToMs } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";
import { computeScheduledPooledAnchorResetPlan } from "@/internal/billing/v2/pooledBalances/compute/computeScheduledPooledAnchorResetPlan.js";
import type { AutumnBillingPlanBuilder } from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";
import type { BillingCycleAnchorResetContext } from "./billingCycleAnchorResetContext";

/** The pool row's cycle ends now, so the next read's lazy reset refills it. */
export const planPooledAnchorReset = ({
	ctx,
	eventContext,
	plan,
}: {
	ctx: StripeWebhookContext;
	eventContext: BillingCycleAnchorResetContext;
	plan: AutumnBillingPlanBuilder;
}): void => {
	const { stripeSubscription, stripeSubscriptionId } = eventContext;
	const completedResetIds = new Set(
		eventContext.billingCycleAnchorResetCustomerProductIds,
	);
	if (completedResetIds.size === 0) return;

	const pooledBalancePlan = computeScheduledPooledAnchorResetPlan({
		ctx,
		fullCustomer: eventContext.fullCustomer,
		customerProducts: eventContext.customerProducts.filter((product) =>
			completedResetIds.has(product.id),
		),
		stripeSubscriptionId,
		anchorMs: secondsToMs(stripeSubscription.billing_cycle_anchor),
	});
	plan.addPooledBalancePlan(pooledBalancePlan);
	for (const {
		pooledCustomerEntitlement,
	} of pooledBalancePlan.updatePoolBalances) {
		plan.updateCustomerEntitlement({
			customerEntitlement: pooledCustomerEntitlement,
			updates: {
				reset_cycle_anchor: pooledCustomerEntitlement.reset_cycle_anchor,
				next_reset_at: pooledCustomerEntitlement.next_reset_at ?? undefined,
			},
		});
	}
};
