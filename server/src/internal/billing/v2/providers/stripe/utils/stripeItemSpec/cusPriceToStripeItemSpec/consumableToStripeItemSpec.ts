import {
	cusEntToBillingObjects,
	type FullCusEntWithFullCusProduct,
	getPriceCurrencyStripeId,
	InternalError,
	isConsumablePrice,
	type StripeItemSpec,
	type UsagePriceConfig,
} from "@autumn/shared";

/**
 * Converts a usage-in-arrear (consumable) price to a StripeItemSpec.
 * For entity-scoped / beta API / Vercel, uses the empty price with quantity 0.
 */
export const consumableToStripeItemSpec = ({
	cusEntWithCusProduct,
	currency,
	orgDefault,
}: {
	cusEntWithCusProduct: FullCusEntWithFullCusProduct;
	currency: string;
	orgDefault: string;
}): StripeItemSpec | null => {
	const billing = cusEntToBillingObjects({ cusEnt: cusEntWithCusProduct });
	if (!billing) return null;

	const { price, product } = billing;

	if (!isConsumablePrice(price)) {
		throw new InternalError({
			message: `[consumableToStripeItemSpec] Price ${price.id} is not a consumable price`,
		});
	}

	const config = price.config as UsagePriceConfig;

	const priceId =
		getPriceCurrencyStripeId({
			config,
			currency,
			orgDefault,
			slot: "stripe_price_id",
		}) ??
		getPriceCurrencyStripeId({
			config,
			currency,
			orgDefault,
			slot: "stripe_empty_price_id",
		});
	if (!priceId) {
		throw new InternalError({
			message: `[consumableToStripeItemSpec] no stripe_price_id for currency '${currency}' on autumn price: ${price.id}`,
		});
	}

	return {
		stripePriceId: priceId,
		autumnPrice: price,
		autumnProduct: product,
	};
};
