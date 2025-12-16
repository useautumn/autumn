import type Stripe from "stripe";

export const stripeInvoiceLineItemToPriceId = (
	lineItem: Stripe.InvoiceLineItem,
) => {
	const priceId = lineItem.pricing?.price_details?.price;
	if (!priceId) {
		return undefined;
	}

	if (typeof priceId !== "string") {
		throw new Error("lineItem.pricing.price_details.price is not a string");
	}

	return priceId;
};

export const stripeInvoiceLineItemToProductId = (
	lineItem: Stripe.InvoiceLineItem,
) => {
	const productId = lineItem.pricing?.price_details?.product;
	if (!productId) {
		return undefined;
	}

	if (typeof productId !== "string") {
		throw new Error("lineItem.pricing.price_details.product is not a string");
	}

	return productId;
};
