import { cp, type FullCusProduct } from "@autumn/shared";
import type Stripe from "stripe";
import {
	type ExpandedStripeInvoice,
	getStripeInvoice,
} from "@/external/stripe/invoices/operations/getStripeInvoice.js";
import { stripeInvoiceToStripeSubscriptionId } from "../../invoices/utils/convertStripeInvoice";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";

export interface StripeInvoicePaidContext {
	stripeInvoice: ExpandedStripeInvoice<["discounts.source.coupon", "payments"]>;
	stripeSubscriptionId?: string;
	customerProducts?: FullCusProduct[];
}

export const setupStripeInvoicePaidContext = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}): Promise<StripeInvoicePaidContext | null> => {
	const { stripeEvent, stripeCli } = ctx;

	const invoiceData = stripeEvent.data.object as Stripe.Invoice;

	const stripeInvoice = await getStripeInvoice({
		stripeClient: stripeCli,
		invoiceId: invoiceData.id!,
		expand: ["discounts.source.coupon", "payments"],
	});

	const stripeSubscriptionId =
		stripeInvoiceToStripeSubscriptionId(stripeInvoice);

	const { fullCustomer } = ctx;

	let customerProducts: FullCusProduct[] | undefined;

	if (fullCustomer && stripeSubscriptionId) {
		customerProducts = fullCustomer.customer_products.filter(
			(customerProduct) => {
				const { valid } = cp(customerProduct)
					.paid()
					.recurring()
					.onStripeSubscription({ stripeSubscriptionId });

				return valid;
			},
		);
	}

	return {
		stripeInvoice,
		stripeSubscriptionId,
		customerProducts,
	};
};
