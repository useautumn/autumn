import {
	InternalError,
	isFixedPrice,
	type Price,
	type Product,
	type UsagePriceConfig,
} from "@autumn/shared";

import type Stripe from "stripe";

type FindSubscriptionItemParams = {
	stripeSubscriptionItems: Stripe.SubscriptionItem[];
	price: Price;
	product: Product;
};

// Overload: errorOnNotFound = true → guaranteed SubscriptionItem
export function findSubscriptionItemByAutumnPrice(
	params: FindSubscriptionItemParams & { errorOnNotFound: true },
): Stripe.SubscriptionItem;

// Overload: errorOnNotFound = false/undefined → SubscriptionItem | undefined
export function findSubscriptionItemByAutumnPrice(
	params: FindSubscriptionItemParams & { errorOnNotFound?: false },
): Stripe.SubscriptionItem | undefined;

// Implementation
export function findSubscriptionItemByAutumnPrice({
	stripeSubscriptionItems,
	price,
	product,
	errorOnNotFound,
}: FindSubscriptionItemParams & { errorOnNotFound?: boolean }):
	| Stripe.SubscriptionItem
	| undefined {
	const stripeProductId = product.processor?.id;

	let result: Stripe.SubscriptionItem | undefined;

	if (isFixedPrice(price)) {
		const config = price.config;

		result = stripeSubscriptionItems.find((si) => {
			return (
				config.stripe_price_id === si.price?.id ||
				(stripeProductId && si.price?.product === stripeProductId)
			);
		});
	} else {
		const config = price.config as UsagePriceConfig;
		result = stripeSubscriptionItems.find(
			(si: Stripe.SubscriptionItem | Stripe.LineItem) => {
				return (
					config.stripe_price_id === si.price?.id ||
					config.stripe_product_id === si.price?.product ||
					config.stripe_empty_price_id === si.price?.id ||
					config.stripe_prepaid_price_v2_id === si.price?.id
				);
			},
		);
	}

	if (errorOnNotFound && !result) {
		throw new InternalError({
			message: `Stripe subscription item not found for price: ${price.id}`,
		});
	}

	return result;
}
