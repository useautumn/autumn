import {
	stripeCheckoutSessionToFeatureOptionsQuantity,
	stripeCheckoutSessionToInvoiceId,
	stripeCheckoutSessionToSubscriptionId,
} from "@/external/stripe/checkoutSessions/utils/convertStripeCheckoutSession";
import { findCheckoutLineItemForAutumnPrice } from "@/internal/billing/v2/providers/stripe/utils/sync/autumnToStripe/findCheckoutLineItemForAutumnPrice";

export const stripeCheckoutSessionUtils = {
	convert: {
		toSubscriptionId: stripeCheckoutSessionToSubscriptionId,
		toInvoiceId: stripeCheckoutSessionToInvoiceId,
		toFeatureOptionsQuantity: stripeCheckoutSessionToFeatureOptionsQuantity,
	},
	find: {
		lineItemByAutumnPrice: findCheckoutLineItemForAutumnPrice,
	},
};
