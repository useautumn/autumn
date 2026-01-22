import {
	type ApiBalanceBreakdownPrice,
	BillingMethod,
} from "@api/customers/cusFeatures/apiBalanceV1";
import type { FullCusEntWithFullCusProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct";
import { cusEntsToMaxPurchase } from "@utils/cusEntUtils/convertCusEntUtils/cusEntsToMaxPurchase";
import { cusEntToCusPrice } from "@utils/cusEntUtils/convertCusEntUtils/cusEntToCusPrice";
import { customerPriceToBillingUnits } from "@utils/cusPriceUtils/convertCustomerPrice/customerPriceToBillingUnits";
import {
	isFixedPrice,
	isPrepaidPrice,
	isUsagePrice,
} from "@utils/productUtils/priceUtils/classifyPriceUtils";

export const customerEntitlementToBalancePrice = ({
	customerEntitlement,
}: {
	customerEntitlement: FullCusEntWithFullCusProduct;
}): ApiBalanceBreakdownPrice | null => {
	const cusPrice = cusEntToCusPrice({ cusEnt: customerEntitlement });

	if (!cusPrice) return null;

	const price = cusPrice.price;

	const maxPurchase = cusEntsToMaxPurchase({ cusEnts: [customerEntitlement] });
	const billingUnits = customerPriceToBillingUnits({ customerPrice: cusPrice });
	const billingMethod = isPrepaidPrice(price)
		? BillingMethod.Prepaid
		: BillingMethod.UsageBased;

	const amount = isFixedPrice(price) ? price.config.amount : undefined;
	const tiers = isUsagePrice({ price: price })
		? price.config.usage_tiers
		: undefined;

	return {
		amount: amount,
		tiers: tiers ?? undefined,
		billing_units: billingUnits,
		billing_method: billingMethod,
		max_purchase: maxPurchase,
	};
};
