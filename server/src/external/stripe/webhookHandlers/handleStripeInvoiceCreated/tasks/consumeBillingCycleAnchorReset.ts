import { secondsToMs, timestampsMatch } from "@autumn/shared";
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
	const completedResets = eventContext.customerProducts.filter(
		(customerProduct) =>
			typeof customerProduct.billing_cycle_anchor_resets_at === "number" &&
			timestampsMatch(
				customerProduct.billing_cycle_anchor_resets_at,
				stripeAnchorMs,
			),
	);

	await Promise.all(
		completedResets.map((customerProduct) =>
			CusProductService.update({
				ctx,
				cusProductId: customerProduct.id,
				updates: {
					billing_cycle_anchor: stripeAnchorMs,
					billing_cycle_anchor_resets_at: null,
				},
			}),
		),
	);
};
