import type Stripe from "stripe";
import { cusProductsToRenewalLineItems } from "@/external/stripe/webhookHandlers/common";
import { processAllocatedPricesForInvoiceCreated } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processAllocatedPricesForInvoiceCreated";
import { processPrepaidPricesForInvoiceCreated } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processPrepaidPricesForInvoiceCreated";
import { upsertAutumnInvoice } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/upsertAutumnInvoice";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import { workflows } from "@/queue/workflows";
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

	await upsertAutumnInvoice({ ctx, eventContext });

	// Store invoice line items (async via SQS workflow)
	const autumnInvoice = await InvoiceService.getByStripeId({
		db: ctx.db,
		stripeId: eventContext.stripeInvoice.id,
	});

	if (autumnInvoice) {
		// Generate billing line items for matching
		const renewalLineItems = cusProductsToRenewalLineItems({
			ctx,
			eventContext,
			arrearLineItems,
		});

		await workflows.triggerStoreInvoiceLineItems({
			orgId: ctx.org.id,
			env: ctx.env,
			stripeInvoiceId: eventContext.stripeInvoice.id,
			autumnInvoiceId: autumnInvoice.id,
			billingLineItems: renewalLineItems,
		});
	}
};
