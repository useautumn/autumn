import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import { setupStripeInvoicePaidContext } from "./setupStripeInvoicePaidContext.js";

export const handleStripeInvoicePaid = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}) => {
	const invoicePaidContext = await setupStripeInvoicePaidContext({ ctx });

	if (!invoicePaidContext) {
		ctx.logger.warn("[invoice.paid] invoicePaidContext not found, skipping");
		return;
	}

	ctx.logger.debug(
		`Received invoice.paid event for invoice ${invoicePaidContext.stripeInvoice.id}`,
	);

	// 1. Handle metadata-based payments (deferred billing, checkout, etc.)
	// await handleInvoicePaidMetadata({ ctx, invoicePaidContext });

	// 2. Handle discount/coupon rollover
	// await handleInvoiceDiscounts({ ctx, invoicePaidContext });

	// 3. Handle based on invoice type (subscription vs one-off)
	if (invoicePaidContext.stripeSubscriptionId) {
		// 3a. Convert to charge_automatically if needed
		// await convertToChargeAutomatically({ ctx, invoicePaidContext });
		// 3b. Create/update Autumn invoice
		// await upsertAutumnInvoice({ ctx, invoicePaidContext });
		// 3c. Trigger checkout rewards
		// await triggerCheckoutRewards({ ctx, invoicePaidContext });
	} else {
		// 3. Handle one-off invoice
		// await handleOneOffInvoicePaid({ ctx, invoicePaidContext });
	}
};
