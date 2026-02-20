import type { Price } from "../../../../models/productModels/priceModels/priceModels";
import { nullish } from "../../../utils";
import { calculateGraduatedTiersAmount } from "./calculateGraduatedTiersAmount";

/**
 * Overage is ANY usage outside of included usage.
 */
export const tiersToLineAmount = ({
	price,
	overage,
	billingUnits = 1,
}: {
	price: Price;
	overage: number;
	billingUnits?: number;
}): number => {
	const tiers = price.config.usage_tiers;

	if (nullish(tiers)) {
		throw new Error(
			"[tiersToLineAmount] usage_tiers required for usage-based prices",
		);
	}

	return calculateGraduatedTiersAmount({
		tiers,
		usage: overage,
		billingUnits,
		allowNegative: true,
	});
};
