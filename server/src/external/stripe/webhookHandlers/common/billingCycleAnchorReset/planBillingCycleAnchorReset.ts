import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import type { AutumnBillingPlanBuilder } from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";
import { planPrepaidCycleResets } from "../prepaidCycleReset/planPrepaidCycleResets";
import type { BillingCycleAnchorResetContext } from "./billingCycleAnchorResetContext";
import { consumeBillingCycleAnchorReset } from "./consumeBillingCycleAnchorReset";
import { planPooledAnchorReset } from "./planPooledAnchorReset";

/**
 * A landed anchor move starts a new cycle for the re-anchored products: their prepaid grants refill,
 * their pools re-anchor, and they bill from Stripe's anchor. Invoiced or not, the plan is the same.
 */
export const planBillingCycleAnchorReset = ({
	ctx,
	eventContext,
	plan,
}: {
	ctx: StripeWebhookContext;
	eventContext: BillingCycleAnchorResetContext;
	plan: AutumnBillingPlanBuilder;
}): void => {
	const resetCustomerProductIds = new Set(
		eventContext.billingCycleAnchorResetCustomerProductIds,
	);
	planPrepaidCycleResets({
		ctx,
		eventContext,
		plan,
		customerProducts: eventContext.customerProducts.filter(({ id }) =>
			resetCustomerProductIds.has(id),
		),
	});
	planPooledAnchorReset({ ctx, eventContext, plan });
	consumeBillingCycleAnchorReset({ eventContext, plan });
};
