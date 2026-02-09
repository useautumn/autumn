import { atmnToStripeAmount, type LineItem, msToSeconds } from "@autumn/shared";
import type Stripe from "stripe";

/**
 * Converts a single LineItem to Stripe.InvoiceItemCreateParams
 *
 * Uses effectivePeriod (the actual period being charged/refunded) for Stripe,
 * which accounts for mid-cycle changes.
 */
const toStripeCreateInvoiceItemParams = ({
	stripeCustomerId,
	stripeSubscriptionId,
	stripeInvoiceId,
	lineItem,
}: {
	stripeCustomerId: string;
	stripeSubscriptionId?: string;
	stripeInvoiceId?: string;
	lineItem: LineItem;
}): Stripe.InvoiceItemCreateParams => {
	const { finalAmount, description, context } = lineItem;
	const { effectivePeriod, currency } = context;

	return {
		customer: stripeCustomerId,
		subscription: stripeSubscriptionId,
		invoice: stripeInvoiceId,
		amount: atmnToStripeAmount({ amount: finalAmount }),
		currency,
		description,
		discountable: false,
		period: effectivePeriod
			? {
					start: msToSeconds(effectivePeriod.start),
					end: msToSeconds(effectivePeriod.end),
				}
			: undefined,
	};
};

/**
 * Converts an array of LineItems to Stripe.InvoiceItemCreateParams[]
 */
export const lineItemsToCreateInvoiceItemsParams = ({
	stripeCustomerId,
	stripeSubscriptionId,
	stripeInvoiceId,
	lineItems,
}: {
	stripeCustomerId: string;
	stripeSubscriptionId?: string;
	stripeInvoiceId?: string;
	lineItems: LineItem[];
}): Stripe.InvoiceItemCreateParams[] => {
	return lineItems.map((lineItem) =>
		toStripeCreateInvoiceItemParams({
			stripeCustomerId,
			stripeSubscriptionId,
			stripeInvoiceId,
			lineItem,
		}),
	);
};
