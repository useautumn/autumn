import type { LineItem } from "../../../../models/billingModels/lineItem/lineItem";
import type { LineItemContext } from "../../../../models/billingModels/lineItem/lineItemContext";
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

	const amount = priceToLineAmount({ price, multiplier: quantity });
	const description = fixedPriceToDescription({
		price,
		currency,
		context,
	});

	const stripePriceId = price.config.stripe_price_id ?? undefined;
	const stripeProductId =
		price.config.stripe_product_id || product.processor?.id || undefined;

	// Default discountable to false so Autumn pre-calculates discounts
	// and they are properly stored in the DB (not baked into the amount)
	const updatedContext: LineItemContext = {
		...context,
		discountable: context.discountable ?? false,
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
