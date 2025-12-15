import { InternalError } from "../../../../api/errors";
import type { LineItem } from "../../../../models/billingModels/invoicingModels/lineItem";
import type { LineItemContext } from "../../../../models/billingModels/invoicingModels/lineItemContext";
import type { FullCusEntWithFullCusProduct } from "../../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { cusEntToPrepaidQuantity } from "../../../cusEntUtils/balanceUtils/cusEntToPrepaidQuantity";
import { cusEntToCusPrice } from "../../../productUtils/convertUtils";
import { usagePriceToLineDescription } from "../descriptionUtils/usagePriceToLineDescription";
import { priceToLineAmount } from "../lineItemUtils/priceToLineAmount";
import { applyProration } from "../prorationUtils/applyProration";

/**
 * Creates a line item for a fixed price.
 * Returns positive amount - caller uses lineItemToCredit() for refunds.
 */
export const prepaidPriceToLineItem = ({
	cusEnt,
	context,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	context: LineItemContext;
}): LineItem => {
	const { now, billingPeriod } = context;

	const cusPrice = cusEntToCusPrice({ cusEnt });

	if (!cusPrice) {
		throw new InternalError({
			message: `[prepaidPriceToLineItem] No cus price found for cus ent (feature: ${cusEnt.entitlement.feature_id})`,
		});
	}

	// 1. Get prepaid quantity
	const prepaidQuantity = cusEntToPrepaidQuantity({ cusEnt });

	// 2. Get amount
	let amount = priceToLineAmount({
		price: cusPrice.price,
		overage: prepaidQuantity,
	});

	if (context.direction === "refund") {
		amount = -amount;
	}

	// 3. Apply proration
	amount = applyProration({
		now,
		billingPeriod,
		amount,
	});

	// 4. Generate description
	const description = usagePriceToLineDescription({
		price: cusPrice.price,
		feature: cusEnt.entitlement.feature,
		usage: prepaidQuantity,
		context,
	});

	return {
		amount,
		description,
		price: cusPrice.price,
		context,
	};
};
