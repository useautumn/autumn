import {
	type FullProduct,
	type Price,
	priceToEnt,
	stripeRefToId,
} from "@autumn/shared";
import type Stripe from "stripe";
import { stripeCheckoutSessionUtils } from "@/external/stripe/checkoutSessions/utils";
import { stripeItemToFeatureOptionsQuantity } from "@/external/stripe/common/utils/stripeItemToFeatureOptionsQuantity";

export const stripeCheckoutSessionToSubscriptionId = async ({
	stripeCheckoutSession,
}: {
	stripeCheckoutSession: Stripe.Checkout.Session;
}) => {
	return stripeRefToId(stripeCheckoutSession.subscription) ?? null;
};

export const stripeCheckoutSessionToInvoiceId = async ({
	stripeCheckoutSession,
}: {
	stripeCheckoutSession: Stripe.Checkout.Session;
}) => {
	return stripeRefToId(stripeCheckoutSession.invoice) ?? null;
};

export const stripeCheckoutSessionToFeatureOptionsQuantity = ({
	stripeCheckoutSession,
	price,
	product,
}: {
	stripeCheckoutSession: Stripe.Checkout.Session;
	price: Price;
	product: FullProduct;
}) => {
	const lineItem = stripeCheckoutSessionUtils.find.lineItemByAutumnPrice({
		lineItems: stripeCheckoutSession.line_items?.data ?? [],
		price,
		product,
	});

	const entitlement = priceToEnt({
		price,
		entitlements: product.entitlements,
	});

	if (lineItem?.quantity && entitlement) {
		const featureOptionsQuantity = stripeItemToFeatureOptionsQuantity({
			itemQuantity: lineItem.quantity,
			price,
			product,
		});

		return featureOptionsQuantity;
	}

	return lineItem?.quantity ?? 0;
};
