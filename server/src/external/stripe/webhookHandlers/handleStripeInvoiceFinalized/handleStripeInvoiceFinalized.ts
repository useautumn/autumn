import type Stripe from "stripe";
import { storeRenewalLineItems } from "@/external/stripe/webhookHandlers/common";
import { invoiceActions } from "@/internal/invoices/actions";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext";
import { setupInvoiceFinalizedContext } from "./setupInvoiceFinalizedContext";
import { enablePendingPlanOnFinalize } from "./tasks/enablePendingPlanOnFinalize";

export const handleStripeInvoiceFinalized = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.InvoiceFinalizedEvent;
}) => {
	await enablePendingPlanOnFinalize({ ctx, stripeInvoice: event.data.object });

	const eventContext = await setupInvoiceFinalizedContext({ ctx, event });

	if (!eventContext) {
		ctx.logger.debug("[invoice.finalized] Skipping - context not found");
		return;
	}

	ctx.logger.info(
		`[invoice.finalized] Processing for invoice ${eventContext.stripeInvoice.id}`,
	);

	const autumnInvoice = await invoiceActions.updateFromStripe({
		ctx,
		customerId: ctx.fullCustomer?.id ?? "",
		stripeInvoice: eventContext.stripeInvoice,
	});

	if (autumnInvoice) {
		await storeRenewalLineItems({
			ctx,
			autumnInvoice,
			stripeInvoiceId: eventContext.stripeInvoice.id,
			arrearLineItems: [],
			reconcileOnly: true,
			emitFinalizedWebhook: !eventContext.isVercelInvoice,
		});
	}
};
