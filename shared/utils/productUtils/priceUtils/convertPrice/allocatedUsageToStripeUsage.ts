import type { Price } from "@models/productModels/priceModels/priceModels";
import { isVolumePrice } from "@utils/productUtils/priceUtils/classifyPriceUtils";
import { Decimal } from "decimal.js";

/** The seats an allocated price's Stripe item counts, before billing-unit rounding.
 * Volume prices sit on net tiers, so Stripe counts only the seats over included. */
export const allocatedUsageToStripeUsage = ({
	price,
	usage,
	allowance,
}: {
	price: Price;
	usage: number;
	allowance: number;
}): number => {
	if (!isVolumePrice(price)) return usage;
	return Decimal.max(0, new Decimal(usage).sub(allowance)).toNumber();
};
