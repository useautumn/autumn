import type { FixedPriceConfig } from "../../../models/productModels/priceModels/priceConfig/fixedPriceConfig";
import type { UsagePriceConfig } from "../../../models/productModels/priceModels/priceConfig/usagePriceConfig";
import { BillingType } from "../../../models/productModels/priceModels/priceEnums";
import type { Price } from "../../../models/productModels/priceModels/priceModels";
import { tiersToLineAmount } from "../../billingUtils/invoicingUtils/lineItemUtils/tiersToLineAmount";
import { getBillingType } from "../priceUtils";

/**
 * Returns the dollar cost for a given overage quantity on a price.
 *
 * "Overage" is the portion of usage that is **not** covered by included free
 * allowance. How it is calculated depends on the billing model:
 *
 * - **Included usage (free tier):** no overage is charged; the free bucket is
 *   consumed first and this function is not called for those units.
 * - **Prepaid** (`UsageInAdvance`): the customer purchased units upfront.
 *   Overage here is any consumption beyond what was prepaid — typically priced
 *   via `tiersToLineAmount` at the end of the period, not this function.
 * - **Pay-per-use** (`UsageInArrear`): overage is `totalUsage − includedFree`.
 *   Pass that net quantity as `overage`; this function prices it against the
 *   graduated tier schedule.
 * - **Fixed** (`FixedCycle` / `OneOff`): no usage tiers apply; returns the flat
 *   `config.amount` regardless of the `overage` argument.
 *
 * @param price - The price to evaluate. Determines billing type and tier schedule.
 * @param overage - Net units consumed above the free/prepaid allowance.
 *   Ignored for fixed-price billing types. Must be pre-subtracted by the caller.
 * @returns Dollar amount for the overage, or the flat price amount for fixed prices.
 */
export const getPriceForOverage = ({
	price,
	overage,
}: {
	price: Price;
	overage?: number;
}) => {
	const usageConfig = price.config as UsagePriceConfig;
	const billingType = getBillingType(usageConfig);

	if (
		billingType === BillingType.FixedCycle ||
		billingType === BillingType.OneOff
	) {
		const config = price.config as FixedPriceConfig;
		return config.amount;
	}

	const billingUnits = usageConfig.billing_units || 1;

	return tiersToLineAmount({
		price,
		overage: overage!,
		billingUnits,
	});
};
