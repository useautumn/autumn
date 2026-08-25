import { secondsToMs } from "@autumn/shared";
import type Stripe from "stripe";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import {
	storeRenewalLineItems,
	upsertAutumnInvoice,
} from "@/external/stripe/webhookHandlers/common";
import { consumeBillingCycleAnchorReset } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/consumeBillingCycleAnchorReset";
import { processAllocatedPricesForInvoiceCreated } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processAllocatedPricesForInvoiceCreated";
import { processPrepaidPricesForInvoiceCreated } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processPrepaidPricesForInvoiceCreated";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext";
import { setupInvoiceCreatedContext } from "./setupInvoiceCreatedContext";
import { processConsumablePricesForInvoiceCreated } from "./tasks/processConsumablePricesForInvoiceCreated";
import { resetSubscriptionPooledBalances } from "./tasks/resetSubscriptionPooledBalances.js";

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
	await resetSubscriptionPooledBalances({ ctx, eventContext });
	await consumeBillingCycleAnchorReset({ ctx, eventContext });

	const shouldStoreScheduleProrationInvoice =
		eventContext.stripeInvoice.billing_reason === "subscription_update" &&
		!!eventContext.stripeSubscription.schedule;
	const updatedStripeInvoice = await getStripeInvoice({
		stripeClient: ctx.stripeCli,
		invoiceId: eventContext.stripeInvoice.id,
		expand: ["discounts.source.coupon", "total_discount_amounts"],
	});

	// Upsert Autumn invoice record
	const autumnInvoice = await upsertAutumnInvoice({
		ctx,
		stripeInvoice: updatedStripeInvoice,
		stripeSubscription: eventContext.stripeSubscription,
		customerProducts: eventContext.customerProducts,
		options: { skipNonCycleInvoices: !shouldStoreScheduleProrationInvoice },
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
