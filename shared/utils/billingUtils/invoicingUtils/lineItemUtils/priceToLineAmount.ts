import {
	isFixedPrice,
	nullish,
	type Price,
	priceAmountsForCurrency,
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
	allowance = 0,
	multiplier = 1,
	currency,
}: {
	price: Price;
	overage?: number;
	allowance?: number;
	multiplier?: number;
	currency?: string;
}): number => {
	// Fixed prices: flat amount × multiplier
	if (isFixedPrice(price)) {
		const config = price.config;
		const amount =
			priceAmountsForCurrency({ config, currency }).amount ?? config.amount;
		return new Decimal(amount).mul(multiplier).toNumber();
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
		allowance,
		billingUnits: price.config.billing_units ?? 1,
		currency,
	});
};
