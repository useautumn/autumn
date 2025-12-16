import { InternalError } from "../../../../api/errors/base/InternalError";
import type { LineItemContext } from "../../../../models/billingModels/invoicingModels/lineItemContext";
import type { FullCusEntWithFullCusProduct } from "../../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { cusEntToPrepaidQuantity } from "../../../cusEntUtils/balanceUtils/cusEntToPrepaidQuantity";
import { cusEntToStripeIds } from "../../../cusEntUtils/convertCusEntUtils/cusEntToStripeIds";
import { cusEntToInvoiceOverage } from "../../../cusEntUtils/overageUtils/cusEntToInvoiceOverage";
import { cusEntToInvoiceUsage } from "../../../cusEntUtils/overageUtils/cusEntToInvoiceUsage";
import { cusEntToCusPrice } from "../../../productUtils/convertUtils";
import { isPrepaidPrice } from "../../../productUtils/priceUtils";
import { isConsumablePrice } from "../../../productUtils/priceUtils/classifyPriceUtils";
import { usagePriceToLineDescription } from "../descriptionUtils/usagePriceToLineDescription";
import { priceToLineAmount } from "../lineItemUtils/priceToLineAmount";
import { buildLineItem } from "./buildLineItem";

export const usagePriceToLineItem = ({
	cusEnt,
	context,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	context: LineItemContext;
}) => {
	const cusPrice = cusEntToCusPrice({ cusEnt });
	const { feature } = context;

	if (!feature) {
		throw new InternalError({
			message: `[usagePriceToLineItem] No feature found for cus ent (feature: ${cusEnt.entitlement.feature_id})`,
		});
	}

	if (!cusPrice) {
		throw new InternalError({
			message: `[usagePriceToLineItem] No cus price found for cus ent (feature: ${feature.id})`,
		});
	}

	const price = cusPrice.price;

	// 1. Get overage
	let overage = 0;
	if (isPrepaidPrice({ price: cusPrice.price })) {
		overage = cusEntToPrepaidQuantity({ cusEnt });
	} else {
		overage = cusEntToInvoiceOverage({ cusEnt });
	}

	// 2. Get usage
	let usage = 0;
	if (isPrepaidPrice({ price: cusPrice.price })) {
		usage = cusEntToPrepaidQuantity({ cusEnt });
	} else {
		usage = cusEntToInvoiceUsage({ cusEnt });
	}

	// 3. Generate description
	const description = usagePriceToLineDescription({
		price: cusPrice.price,
		feature: cusEnt.entitlement.feature,
		usage,
		context,
	});

	// 4. Get amount
	const amount = priceToLineAmount({
		price,
		overage,
	});

	// 5. Get stripe price / product IDs
	const { stripePriceId, stripeProductId } = cusEntToStripeIds({ cusEnt });

	// 6. Should prorate: don't if consumable price
	const shouldProrate = !isConsumablePrice(price);

	return buildLineItem({
		context,
		amount,
		description,

		stripePriceId,
		stripeProductId,

		shouldProrate,
	});
};
