import type { LineItem } from "../../../../models/billingModels/lineItem/lineItem";
import type { LineItemContext } from "../../../../models/billingModels/lineItem/lineItemContext";
import { getPriceCurrencyStripeId } from "../../../../models/productModels/priceModels/priceConfig/priceCurrencyView";
import { fixedPriceToDescription } from "../descriptionUtils/fixedPriceToLineDescription";
import { priceToLineAmount } from "../lineItemUtils/priceToLineAmount";
import { buildLineItem } from "./buildLineItem";

/**
 * Creates a line item for a fixed price.
 * Returns positive amount - caller uses lineItemToCredit() for refunds.
 */
export const fixedPriceToLineItem = ({
	currency,
	quantity = 1,
	context,
}: {
	currency?: string;
	quantity?: number;
	context: LineItemContext;
}): LineItem => {
	const { price, product } = context;
	const billingCurrency = currency ?? context.currency;

	const amount = priceToLineAmount({
		price,
		multiplier: quantity,
		currency: billingCurrency,
	});
	const description = fixedPriceToDescription({
		price,
		currency,
		context,
	});

	const stripePriceId = billingCurrency
		? (getPriceCurrencyStripeId({
				config: price.config,
				currency: billingCurrency,
				orgDefault: price.config.base_currency ?? billingCurrency,
				slot: "stripe_price_id",
			}) ?? undefined)
		: (price.config.stripe_price_id ?? undefined);
	const stripeProductId =
		price.config.stripe_product_id || product.processor?.id || undefined;

	// Default discountable to false so Autumn pre-calculates discounts
	// and they are properly stored in the DB (not baked into the amount)
	const updatedContext: LineItemContext = {
		...context,
		discountable: context.discountable,
	};

	return buildLineItem({
		context: updatedContext,
		amount,
		description,
		stripePriceId,
		stripeProductId,
		usage: quantity,
		overage: quantity,
	});
};
