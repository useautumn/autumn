import { secondsToMs } from "@autumn/shared";
import type Stripe from "stripe";
import {
	storeRenewalLineItems,
	upsertAutumnInvoice,
} from "@/external/stripe/webhookHandlers/common";
import { processAllocatedPricesForInvoiceCreated } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processAllocatedPricesForInvoiceCreated";
import { processPrepaidPricesForInvoiceCreated } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processPrepaidPricesForInvoiceCreated";
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

	// Capture arrear line items before balance resets
	const arrearLineItems = await processConsumablePricesForInvoiceCreated({
		ctx,
		eventContext,
	});
	await processPrepaidPricesForInvoiceCreated({ ctx, eventContext });
	await processAllocatedPricesForInvoiceCreated({ ctx, eventContext });

	// Upsert Autumn invoice record
	const autumnInvoice = await upsertAutumnInvoice({
		ctx,
		stripeInvoice: eventContext.stripeInvoice,
		stripeSubscription: eventContext.stripeSubscription,
		customerProducts: eventContext.customerProducts,
		options: { skipNonCycleInvoices: true },
	});

	// Store invoice line items (async via SQS workflow)
	if (autumnInvoice) {
		const periodEndMs = secondsToMs(eventContext.stripeInvoice.period_end);
		await storeRenewalLineItems({
			ctx,
			autumnInvoice,
			stripeInvoiceId: eventContext.stripeInvoice.id,
			arrearLineItems,
			eventContext,
			periodEndMs,
		});
	}
};
