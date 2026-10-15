import type Stripe from "stripe";
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";

/** The subscription a subscription, invoice or schedule event is about, if any. */
export const stripeEventToStripeSubscriptionId = ({
	stripeEvent,
}: {
	stripeEvent: Stripe.Event;
}): string | undefined => {
	switch (stripeEvent.type) {
		case "customer.subscription.created":
		case "customer.subscription.updated":
		case "customer.subscription.deleted":
			return stripeEvent.data.object.id;

		case "invoice.paid":
		case "invoice.updated":
		case "invoice.created":
		case "invoice.finalized":
			return stripeInvoiceToStripeSubscriptionId(stripeEvent.data.object);

		case "subscription_schedule.canceled":
		case "subscription_schedule.released":
		case "subscription_schedule.updated": {
			const { subscription } = stripeEvent.data.object;
			return typeof subscription === "string" ? subscription : subscription?.id;
		}

		default:
			return undefined;
	}
};
