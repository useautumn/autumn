import type { LineItem } from "../../../../models/billingModels/invoicingModels/lineItem";
import type { FullCusEntWithFullCusProduct } from "../../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { cusEntToTotalOverage } from "../../../cusEntUtils/overageUtils/cusEntsToTotalOverage";
import { getFeatureInvoiceDescription } from "../../../displayUtils";
import { cusEntToCusPrice } from "../../../productUtils/convertUtils";
import { tiersToLineAmount } from "../lineItemUtils/tiersToLineAmount";

/**
 * Creates a line item for a consumable (UsageInArrear) price.
 * Returns null if there's no overage to charge.
 */
export const consumableToLineItem = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}): LineItem | null => {
	// 1. Get the related price
	const cusPrice = cusEntToCusPrice({ cusEnt });
	if (!cusPrice) return null;

	const price = cusPrice.price;
	const billingUnits = price.config.billing_units ?? 1;

	// 2. Get overage from cusEnt balance
	const overage = cusEntToTotalOverage({ cusEnt });
	if (overage <= 0) return null;

	// 3. Calculate amount using tiers
	const amount = tiersToLineAmount({ price, overage, billingUnits });

	// 4. Calculate total usage for description
	const allowance = cusEnt.entitlement.allowance ?? 0;
	const balance = cusEnt.balance ?? 0;
	const usage = allowance - balance;

	// 5. Generate description
	const description = getFeatureInvoiceDescription({
		feature: cusEnt.entitlement.feature,
		usage,
		billingUnits,
		prodName: cusEnt.customer_product.product.name,
	});

	return {
		amount,
		description,
		price_id: price.id,
		feature_id: cusEnt.entitlement.feature_id,
	};
};
