import {
	cusProductToProduct,
	type FixedPriceConfig,
	type FullCusProduct,
	type FullCustomerPrice,
	InternalError,
	type StripeInlinePrice,
} from "@autumn/shared";
import { atmnToStripeAmountDecimal } from "@shared/utils/productUtils/priceUtils/convertAmountUtils";
import { priceToStripeRecurringParams } from "@shared/utils/productUtils/priceUtils/convertPrice/priceToStripeRecurringParams";

/** Builds a flat inline Stripe price for a fixed price — the base-price
 * counterpart of `cusEntToInlineStripePrice`. */
export const fixedPriceToInlineStripePrice = ({
	cusPrice,
	cusProduct,
	currency,
}: {
	cusPrice: FullCustomerPrice;
	cusProduct: FullCusProduct;
	currency: string;
}): StripeInlinePrice => {
	const price = cusPrice.price;
	const config = price.config as FixedPriceConfig;

	const productId =
		config.stripe_product_id ??
		cusProductToProduct({ cusProduct }).processor?.id;
	if (!productId) {
		throw new InternalError({
			message: `[fixedPriceToInlineStripePrice] Price ${price.id} has no Stripe product for inline price`,
		});
	}

	const recurring = priceToStripeRecurringParams({ price });
	return {
		product: productId,
		currency,
		...(recurring && { recurring }),
		unit_amount_decimal: atmnToStripeAmountDecimal({
			amount: config.amount ?? 0,
			currency,
		}),
	};
};
