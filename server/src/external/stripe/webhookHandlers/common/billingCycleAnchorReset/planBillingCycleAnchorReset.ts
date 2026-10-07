import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import type { AutumnBillingPlanBuilder } from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";
import { planPrepaidCycleResets } from "../prepaidCycleReset/planPrepaidCycleResets";
import type { BillingCycleAnchorResetContext } from "./billingCycleAnchorResetContext";
import { consumeBillingCycleAnchorReset } from "./consumeBillingCycleAnchorReset";
import { planPooledAnchorReset } from "./planPooledAnchorReset";

/** Invoiced or not, a landed anchor move plans the same reset. */
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
