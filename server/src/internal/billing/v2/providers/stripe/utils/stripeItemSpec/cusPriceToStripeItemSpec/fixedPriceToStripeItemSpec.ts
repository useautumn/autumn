import {
	cusProductToProduct,
	type FixedPriceConfig,
	type FullCusProduct,
	type FullCustomerPrice,
	InternalError,
	type StripeItemSpec,
} from "@autumn/shared";

/** Converts a fixed-cycle or one-off price to a StripeItemSpec. */
export const fixedPriceToStripeItemSpec = ({
	cusPrice,
	cusProduct,
}: {
	cusPrice: FullCustomerPrice;
	cusProduct: FullCusProduct;
}): StripeItemSpec => {
	const price = cusPrice.price;
	const product = cusProductToProduct({ cusProduct });
	const config = price.config as FixedPriceConfig;

	if (!config.stripe_price_id) {
		throw new InternalError({
			message: `[fixedPriceToStripeItemSpec] Price ${price.id} has no config.stripe_price_id`,
		});
	}

	return {
		stripePriceId: config.stripe_price_id,
		quantity: 1,
		autumnPrice: price,
		autumnProduct: product,
	};
};
