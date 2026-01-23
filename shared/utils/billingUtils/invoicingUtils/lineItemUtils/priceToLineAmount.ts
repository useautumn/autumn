import {
	isFixedPrice,
	nullish,
	type Price,
	tiersToLineAmount,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
/**
 * Calculates the base amount for a price.
 *
 * @param price - The price to calculate
 * @param overage - Overage amount (for prepaid or usage-in-arrear prices)
 * @param multiplier - Quantity multiplier (for fixed prices, e.g. 3 seats)
 */

export const priceToLineAmount = ({
	price,
	overage,
	multiplier = 1,
}: {
	price: Price;
	overage?: number;
	multiplier?: number;
}): number => {
	// Fixed prices: flat amount × multiplier
	if (isFixedPrice(price)) {
		const config = price.config;
		return new Decimal(config.amount).mul(multiplier).toNumber();
	}

	// Usage-based prices: tiered calculation
	if (nullish(overage)) {
		throw new Error(
			`[priceToLineAmount] overage required for usage-based prices`,
		);
	}

	return tiersToLineAmount({
		price,
		overage,
		billingUnits: price.config.billing_units ?? 1,
	});
};
