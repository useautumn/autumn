import {
	stripeCheckoutSessionToInvoiceId,
	stripeCheckoutSessionToSubscriptionId,
} from "@/external/stripe/checkoutSessions/utils/convertStripeCheckoutSession";

export const stripeCheckoutSessionUtils = {
	convert: {
		toSubscriptionId: stripeCheckoutSessionToSubscriptionId,
		toInvoiceId: stripeCheckoutSessionToInvoiceId,
	},
};
