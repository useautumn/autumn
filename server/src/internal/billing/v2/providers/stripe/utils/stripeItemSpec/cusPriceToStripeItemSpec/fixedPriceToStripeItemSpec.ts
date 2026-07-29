import {
	cusProductToProduct,
	type FixedPriceConfig,
	type FullCusProduct,
	type FullCustomerPrice,
	getPriceCurrencyStripeId,
	InternalError,
	type StripeItemSpec,
} from "@autumn/shared";

/** Converts a fixed-cycle or one-off price to a StripeItemSpec. */
export const fixedPriceToStripeItemSpec = ({
	cusPrice,
	cusProduct,
	currency,
	orgDefault,
}: {
	cusPrice: FullCustomerPrice;
	cusProduct: FullCusProduct;
	currency: string;
	orgDefault: string;
}): StripeItemSpec => {
	const price = cusPrice.price;
	const product = cusProductToProduct({ cusProduct });
	const config = price.config as FixedPriceConfig;

	const stripePriceId = getPriceCurrencyStripeId({
		config,
		currency,
		orgDefault,
		slot: "stripe_price_id",
	});
	if (!stripePriceId) {
		throw new InternalError({
			message: `[fixedPriceToStripeItemSpec] Price ${price.id} has no stripe_price_id for currency '${currency}'`,
		});
	}

	return {
		stripePriceId,
		quantity: 1,
		autumnPrice: price,
		autumnProduct: product,
	};
};
