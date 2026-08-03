import {
	cusProductToProduct,
	type FixedPriceConfig,
	type FullCusProduct,
	type FullCustomerPrice,
	getPriceCurrencyStripeId,
	InternalError,
	type StripeItemSpec,
	type StripeItemSpecMode,
} from "@autumn/shared";
import { fixedPriceToInlineStripePrice } from "./fixedPriceToInlineStripePrice";

/** Converts a fixed-cycle or one-off price to a StripeItemSpec. */
export const fixedPriceToStripeItemSpec = ({
	cusPrice,
	cusProduct,
	currency,
	orgDefault,
	options,
}: {
	cusPrice: FullCustomerPrice;
	cusProduct: FullCusProduct;
	currency: string;
	orgDefault: string;
	options?: { mode?: StripeItemSpecMode };
}): StripeItemSpec => {
	const price = cusPrice.price;
	const product = cusProductToProduct({ cusProduct });
	const config = price.config as FixedPriceConfig;

	if (options?.mode === "inline") {
		return {
			stripeInlinePrice: fixedPriceToInlineStripePrice({
				cusPrice,
				cusProduct,
				currency,
			}),
			quantity: 1,
			autumnPrice: price,
			autumnProduct: product,
			metadata: { inline_price: "true", inline_mode: "true" },
		};
	}

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
