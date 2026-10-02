import { secondsToMs } from "@autumn/shared";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";
import type { AutumnBillingPlanBuilder } from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";

/** A product whose scheduled anchor move landed on this invoice now bills from Stripe's anchor. */
export const consumeBillingCycleAnchorReset = ({
	eventContext,
	plan,
}: {
	eventContext: InvoiceCreatedContext;
	plan: AutumnBillingPlanBuilder;
}) => {
	const stripeAnchorMs = secondsToMs(
		eventContext.stripeSubscription.billing_cycle_anchor,
	);
	const resetCustomerProductIds = new Set(
		eventContext.billingCycleAnchorResetCustomerProductIds,
	);

	for (const customerProduct of eventContext.customerProducts) {
		if (!resetCustomerProductIds.has(customerProduct.id)) continue;
		plan.updateCustomerProduct({
			customerProduct,
			updates: {
				billing_cycle_anchor: stripeAnchorMs,
				billing_cycle_anchor_resets_at: null,
			},
		});
	}
};
