import {
	stripeCheckoutSessionToFeatureOptionsQuantity,
	stripeCheckoutSessionToInvoiceId,
	stripeCheckoutSessionToSubscriptionId,
} from "@/external/stripe/checkoutSessions/utils/convertStripeCheckoutSession";
import { findCheckoutLineItemByAutumnPrice } from "@/external/stripe/checkoutSessions/utils/findCheckoutLineItem";

export const stripeCheckoutSessionUtils = {
	convert: {
		toSubscriptionId: stripeCheckoutSessionToSubscriptionId,
		toInvoiceId: stripeCheckoutSessionToInvoiceId,
		toFeatureOptionsQuantity: stripeCheckoutSessionToFeatureOptionsQuantity,
	},
	find: {
		lineItemByAutumnPrice: findCheckoutLineItemByAutumnPrice,
	},
};
