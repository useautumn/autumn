import { InternalError } from "../../../../api/errors/base/InternalError";
import type { LineItemContext } from "../../../../models/billingModels/invoicingModels/lineItemContext";
import type { FullCusEntWithFullCusProduct } from "../../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { cusEntToInvoiceOverage } from "../../../cusEntUtils/overageUtils/cusEntToInvoiceOverage";
import { cusEntToInvoiceUsage } from "../../../cusEntUtils/overageUtils/cusEntToInvoiceUsage";
import { cusEntToCusPrice } from "../../../productUtils/convertUtils";
import { usagePriceToLineDescription } from "../descriptionUtils/usagePriceToLineDescription";
import { priceToLineAmount } from "../lineItemUtils/priceToLineAmount";
// import { usagePriceToLineDescription } from "../descriptionUtils/usagePriceToLineDescription";

/**
 * Creates a line item for a consumable (UsageInArrear) price.
 * Returns null if there's no overage to charge.
 */
export const consumablePriceToLineItem = ({
	cusEnt,
	context,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	context: LineItemContext;
}) => {
	// 1. Get cus price
	const cusPrice = cusEntToCusPrice({ cusEnt });

	if (!cusPrice) {
		throw new InternalError({
			message: `[consumablePriceToLineItem] No cus price found for cus ent (feature: ${cusEnt.entitlement.feature_id})`,
		});
	}

	// 1. Get usage / overage
	const invoiceUsage = cusEntToInvoiceUsage({ cusEnt });
	const invoiceOverage = cusEntToInvoiceOverage({ cusEnt });

	// 2. Get amount
	const amount = priceToLineAmount({
		price: cusPrice.price,
		overage: invoiceOverage,
	});

	// 4. Generate description
	const description = usagePriceToLineDescription({
		price: cusPrice.price,
		feature: cusEnt.entitlement.feature,
		usage: invoiceUsage,
		context,
	});

	return {
		amount,
		description,
		price: cusPrice.price,
		context,
	};
};
