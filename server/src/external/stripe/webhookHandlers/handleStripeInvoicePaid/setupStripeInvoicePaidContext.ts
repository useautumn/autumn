import type Stripe from "stripe";
import {
	getFullStripeInvoice,
	invoiceToSubId,
} from "@/external/stripe/stripeInvoiceUtils.js";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";

export interface StripeInvoicePaidContext {
	stripeInvoice: Stripe.Invoice;
	stripeSubscriptionId: string | null;
}

export const setupStripeInvoicePaidContext = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}): Promise<StripeInvoicePaidContext | null> => {
	const { stripeEvent, stripeCli } = ctx;

	const invoiceData = stripeEvent.data.object as Stripe.Invoice;

	const stripeInvoice = await getFullStripeInvoice({
		stripeCli,
		stripeId: invoiceData.id!,
		expand: ["payments"],
	});

	const stripeSubscriptionId = invoiceToSubId({ invoice: stripeInvoice }) ?? null;

	return {
		stripeInvoice,
		stripeSubscriptionId,
	};
};
