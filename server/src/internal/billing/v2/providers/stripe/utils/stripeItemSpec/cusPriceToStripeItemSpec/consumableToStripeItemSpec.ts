import {
	cusEntToBillingObjects,
	type FullCusEntWithFullCusProduct,
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
}: {
	cusEntWithCusProduct: FullCusEntWithFullCusProduct;
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

	const priceId = config.stripe_price_id ?? config.stripe_empty_price_id;
	if (!priceId) {
		throw new InternalError({
			message: `[consumableToStripeItemSpec] config.stripe_price_id is empty for autumn price: ${price.id}`,
		});
	}

	return {
		stripePriceId: priceId,
		autumnPrice: price,
		autumnProduct: product,
	};
};
