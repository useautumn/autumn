import { secondsToMs } from "@autumn/shared";
import type Stripe from "stripe";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import {
	storeRenewalLineItems,
	upsertAutumnInvoice,
} from "@/external/stripe/webhookHandlers/common";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext";
import { renewCustomerOnInvoice } from "./renewCustomerOnInvoice";
import { renewSharedSubscriptionCustomers } from "./renewSharedSubscriptionCustomers";
import { setupInvoiceCreatedContext } from "./setupInvoiceCreatedContext";

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

	const arrearLineItems = await renewCustomerOnInvoice({ ctx, eventContext });

	// Other customers with plans on this subscription renew on the same invoice
	const sharedArrearLineItems = await renewSharedSubscriptionCustomers({
		ctx,
		event,
		eventContext,
	});

	// Mirror the invoice under the customer the event resolved to
	const shouldStoreScheduleProrationInvoice =
		eventContext.stripeInvoice.billing_reason === "subscription_update" &&
		!!eventContext.stripeSubscription.schedule;
	const updatedStripeInvoice = await getStripeInvoice({
		stripeClient: ctx.stripeCli,
		invoiceId: eventContext.stripeInvoice.id,
		expand: ["discounts.source.coupon", "total_discount_amounts"],
	});

	const invoiceResult = await upsertAutumnInvoice({
		ctx,
		stripeInvoice: updatedStripeInvoice,
		stripeSubscription: eventContext.stripeSubscription,
		customerProducts: eventContext.customerProducts,
		options: { skipNonCycleInvoices: !shouldStoreScheduleProrationInvoice },
	});
	eventContext.results.invoice = invoiceResult;

	// Store invoice line items (async via SQS workflow)
	const autumnInvoice = invoiceResult?.invoice;
	if (autumnInvoice) {
		const periodEndMs = secondsToMs(eventContext.stripeInvoice.period_end);
		await storeRenewalLineItems({
			ctx,
			autumnInvoice,
			stripeInvoiceId: eventContext.stripeInvoice.id,
			arrearLineItems: [...arrearLineItems, ...sharedArrearLineItems],
			eventContext,
			periodEndMs,
		});
	}

	ctx.handlerResult = { type: "invoice.created", context: eventContext };
};
