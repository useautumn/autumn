import {
	InternalError,
	isFixedPrice,
	type Price,
	type Product,
	type UsagePriceConfig,
} from "@autumn/shared";

import type Stripe from "stripe";

type FindCheckoutLineItemParams = {
	lineItems: Stripe.LineItem[];
	price: Price;
	product: Product;
};

// Overload: errorOnNotFound = true → guaranteed LineItem
export function findCheckoutLineItemByAutumnPrice(
	params: FindCheckoutLineItemParams & { errorOnNotFound: true },
): Stripe.LineItem;

// Overload: errorOnNotFound = false/undefined → LineItem | undefined
export function findCheckoutLineItemByAutumnPrice(
	params: FindCheckoutLineItemParams & { errorOnNotFound?: false },
): Stripe.LineItem | undefined;

// Implementation
export function findCheckoutLineItemByAutumnPrice({
	lineItems,
	price,
	product,
	errorOnNotFound,
}: FindCheckoutLineItemParams & { errorOnNotFound?: boolean }):
	| Stripe.LineItem
	| undefined {
	const stripeProductId = product.processor?.id;

	let result: Stripe.LineItem | undefined;

	if (isFixedPrice(price)) {
		const config = price.config;

		result = lineItems.find((li) => {
			return (
				config.stripe_price_id === li.price?.id ||
				(stripeProductId && li.price?.product === stripeProductId)
			);
		});
	} else {
		const config = price.config as UsagePriceConfig;
		result = lineItems.find((li) => {
			return (
				config.stripe_price_id === li.price?.id ||
				config.stripe_product_id === li.price?.product ||
				config.stripe_empty_price_id === li.price?.id ||
				config.stripe_prepaid_price_v2_id === li.price?.id
			);
		});
	}

	if (errorOnNotFound && !result) {
		throw new InternalError({
			message: `Checkout line item not found for price: ${price.id}`,
		});
	}

	return result;
}
