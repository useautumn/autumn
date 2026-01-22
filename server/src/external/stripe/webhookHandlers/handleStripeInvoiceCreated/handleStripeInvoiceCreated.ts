import type Stripe from "stripe";
import { processAllocatedPricesForInvoiceCreated } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processAllocatedPricesForInvoiceCreated";
import { processPrepaidPricesForInvoiceCreated } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processPrepaidPricesForInvoiceCreated";
import { upsertAutumnInvoice } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/upsertAutumnInvoice";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext";
import { setupInvoiceCreatedContext } from "./setupInvoiceCreatedContext";
import { processConsumablePricesForInvoiceCreated } from "./tasks/processConsumablePricesForInvoiceCreated";

export const handleStripeInvoiceCreated = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.InvoiceCreatedEvent;
}) => {
	const eventContext = await setupInvoiceCreatedContext({ ctx, event });

	if (!eventContext) {
		ctx.logger.debug("[invoice.created] Skipping - context not found");
		return;
	}

	ctx.logger.info(
		`[invoice.created] Processing for invoice ${eventContext.stripeInvoice.id}`,
	);

	await processConsumablePricesForInvoiceCreated({ ctx, eventContext });
	await processPrepaidPricesForInvoiceCreated({ ctx, eventContext });
	await processAllocatedPricesForInvoiceCreated({ ctx, eventContext });

	await upsertAutumnInvoice({ ctx, eventContext });
};
