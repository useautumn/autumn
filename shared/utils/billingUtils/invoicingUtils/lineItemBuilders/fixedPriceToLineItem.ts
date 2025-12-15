import type { LineItem } from "../../../../models/billingModels/invoicingModels/lineItem";
import type { LineItemContext } from "../../../../models/billingModels/invoicingModels/lineItemContext";
import type { Price } from "../../../../models/productModels/priceModels/priceModels";
import { fixedPriceToDescription } from "../descriptionUtils/fixedPriceToLineDescription";
import { priceToLineAmount } from "../lineItemUtils/priceToLineAmount";
import { applyProration } from "../prorationUtils/applyProration";

/**
 * Creates a line item for a fixed price.
 * Returns positive amount - caller uses lineItemToCredit() for refunds.
 */
export const fixedPriceToLineItem = ({
	price,
	currency,
	quantity = 1,
	context,
}: {
	price: Price;
	currency?: string;
	quantity?: number;
	context: LineItemContext;
}): LineItem => {
	// 1. Calculate base amount
	let amount = priceToLineAmount({ price, multiplier: quantity });

	// 2. Apply proration
	const { now, billingPeriod } = context;
	amount = applyProration({
		now,
		amount,
		billingPeriod: billingPeriod,
	});

	if (context.direction === "refund") {
		amount = -amount;
	}

	// 3. Generate description
	const description = fixedPriceToDescription({
		price,
		currency,
		context,
	});

	return {
		amount,
		description,
		price,
		context,
	};
};
