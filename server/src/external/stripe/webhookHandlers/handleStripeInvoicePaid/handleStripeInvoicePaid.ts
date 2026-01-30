import type Stripe from "stripe";
import { convertToChargeAutomatically } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/tasks/convertToChargeAutomatically.js";
import { queueCheckoutRewardTasks } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/tasks/queueCheckoutRewardTasks.js";
import { sendEmailReceipt } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/tasks/sendEmailReceipt.js";
import { upsertAutumnInvoice } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/tasks/upsertAutumnInvoice.js";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import { setupStripeInvoicePaidContext } from "./setupStripeInvoicePaidContext.js";
import { handleStripeInvoiceDiscounts } from "./tasks/handleStripeInvoiceDiscounts.js";
import { handleStripeInvoiceMetadata } from "./tasks/handleStripeInvoiceMetadata/handleStripeInvoiceMetadata.js";

export const handleStripeInvoicePaid = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.InvoicePaidEvent;
}) => {
	const invoicePaidContext = await setupStripeInvoicePaidContext({
		ctx,
		event,
	});

	if (!invoicePaidContext) {
		ctx.logger.warn("[invoice.paid] invoicePaidContext not found, skipping");
		return;
	}

	ctx.logger.debug(
		`Received invoice.paid event for invoice ${invoicePaidContext.stripeInvoice.id}`,
	);

	// 1. Handle metadata-based payments (deferred billing, checkout, etc.)
	await handleStripeInvoiceMetadata({ ctx, invoicePaidContext });

	// 2. Handle discount/coupon rollover
	await handleStripeInvoiceDiscounts({ ctx, invoicePaidContext });

	// 3. Upsert Autumn invoice
	await upsertAutumnInvoice({ ctx, invoicePaidContext });

	if (invoicePaidContext.stripeSubscriptionId) {
		await convertToChargeAutomatically({ ctx, invoicePaidContext });

		// 3c. Trigger checkout rewards
		await queueCheckoutRewardTasks({ ctx, invoicePaidContext });
	}

	// 4. Send email receipt
	await sendEmailReceipt({ ctx, invoicePaidContext });
};
