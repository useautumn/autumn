import { secondsToMs } from "@autumn/shared";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext.js";
import { isBillingCycleAnchorResetInvoice } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/utils/isBillingCycleAnchorResetInvoice.js";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";
import { computeScheduledPooledAnchorResetPlan } from "@/internal/billing/v2/pooledBalances/compute/computeScheduledPooledAnchorResetPlan.js";
import type { AutumnBillingPlanBuilder } from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";

/**
 * A completed anchor move re-anchors the pools its products feed: shares move to the new cycle and the
 * pool row's cycle ends now, so the next read's lazy reset refills it. A plain cycle invoice plans
 * nothing for pools: the lazy reset (and the worker's own) refills subscription-mode pools.
 */
export const planScheduledPooledAnchorReset = ({
	ctx,
	eventContext,
	plan,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
	plan: AutumnBillingPlanBuilder;
}): void => {
	const { stripeSubscription, stripeSubscriptionId } = eventContext;
	if (!isBillingCycleAnchorResetInvoice({ eventContext })) return;
	const completedResetIds = new Set(
		eventContext.billingCycleAnchorResetCustomerProductIds,
	);

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
