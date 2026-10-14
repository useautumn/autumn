import {
	isFixedPrice,
	nullish,
	type Price,
	priceAmountsForCurrency,
	tiersToLineAmount,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

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
	if (isFixedPrice(price)) {
		const config = price.config;
		const amount =
			priceAmountsForCurrency({ config, currency }).amount ?? config.amount;
		return new Decimal(amount).mul(multiplier).toNumber();
	}

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
