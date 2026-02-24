import type { ApiBalanceBreakdownPrice } from "@api/customers/cusFeatures/apiBalanceV1.js";
import { BillingMethod } from "@api/products/components/billingMethod.js";
import type { FullCusEntWithFullCusProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import {
	TierBehaviours,
	type UsagePriceConfig,
} from "@models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import { cusEntsToMaxPurchase } from "@utils/cusEntUtils/convertCusEntUtils/cusEntsToMaxPurchase.js";
import { cusEntToCusPrice } from "@utils/cusEntUtils/convertCusEntUtils/cusEntToCusPrice.js";
import { customerPriceToBillingUnits } from "@utils/cusPriceUtils/convertCustomerPrice/customerPriceToBillingUnits.js";
import {
	isFixedPrice,
	isPrepaidPrice,
	isUsagePrice,
} from "@utils/productUtils/priceUtils/classifyPriceUtils.js";

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

	// Determine amount vs tiers
	// If fixed price or usage price with single tier, use amount
	// If usage price with multiple tiers, use tiers array
	let amount: number | undefined;
	let tiers: UsagePriceConfig["usage_tiers"] | undefined;
	let tier_behaviour: TierBehaviours | undefined;

	if (isFixedPrice(price)) {
		amount = price.config.amount;
	} else if (isUsagePrice({ price })) {
		const usageTiers = (price.config as UsagePriceConfig).usage_tiers;
		if (usageTiers.length === 1) {
			amount = usageTiers[0].amount;
		} else {
			tiers = usageTiers;
			tier_behaviour = price.tier_behaviour ?? TierBehaviours.Graduated;
		}
	}

	return {
		amount,
		tiers,
		tier_behaviour,
		billing_units: billingUnits,
		billing_method: billingMethod,
		max_purchase: maxPurchase,
	};
};
