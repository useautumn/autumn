import { secondsToMs } from "@autumn/shared";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

export const consumeBillingCycleAnchorReset = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
}) => {
	const stripeAnchorMs = secondsToMs(
		eventContext.stripeSubscription.billing_cycle_anchor,
	);

	await Promise.all(
		eventContext.billingCycleAnchorResetCustomerProductIds.map(
			(customerProductId) =>
				CusProductService.update({
					ctx,
					cusProductId: customerProductId,
					updates: {
						billing_cycle_anchor: stripeAnchorMs,
						billing_cycle_anchor_resets_at: null,
					},
				}),
		),
	);
};
