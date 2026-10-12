import { Decimal } from "decimal.js";
import type { Price } from "../../../../models/productModels/priceModels/priceModels";
import { tiersToLineBands } from "./tiersToLineBands";

/**
 * The sum of the price's tier bands. Volume takes total usage from `cusEntToVolumeInvoiceQuantity`;
 * a negative quantity is priced on its absolute value and negated, for refunds.
 */
export const tiersToLineAmount = ({
	price,
	overage,
	allowance = 0,
	billingUnits,
	currency,
}: {
	price: Price;
	overage: number;
	allowance?: number;
	billingUnits?: number;
	currency?: string;
}): number => {
	if (!price.config.usage_tiers) {
		throw new Error(
			"[tiersToLineAmount] usage_tiers required for usage-based or prepaid prices",
		);
	}

	const amount = tiersToLineBands({
		price,
		overage: Math.abs(overage),
		allowance,
		billingUnits,
		currency,
	})
		.reduce((sum, band) => sum.plus(band.amount), new Decimal(0))
		.toDecimalPlaces(10)
		.toNumber();

	return overage < 0 ? -amount : amount;
};
