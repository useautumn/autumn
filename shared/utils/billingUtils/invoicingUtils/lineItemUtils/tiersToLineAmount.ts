import { Decimal } from "decimal.js";
import type { Price } from "../../../../models/productModels/priceModels/priceModels";
import { Infinite } from "../../../../models/productModels/productEnums";
import { nullish } from "../../../utils";

export const tiersToLineAmount = ({
	price,
	overage,
	billingUnits = 1,
}: {
	price: Price;
	overage: number;
	billingUnits?: number;
}): number => {
	// Round up to billing units
	const roundedOverage = new Decimal(overage)
		.div(billingUnits)
		.ceil()
		.mul(billingUnits)
		.toNumber();

	let amount = new Decimal(0);
	let remaining = new Decimal(roundedOverage);
	let lastTierTo = 0;
	const tiers = price.config.usage_tiers;

	if (nullish(tiers)) {
		throw new Error(
			`[tiersToLineAmount] usage_tiers required for usage-based prices`,
		);
	}

	for (const tier of tiers) {
		if (remaining.lte(0)) break;

		const isFinalTier = tier.to === Infinite || tier.to === -1;

		const tierSize = isFinalTier
			? remaining
			: Decimal.min(remaining, new Decimal(tier.to).minus(lastTierTo));

		const rate = new Decimal(tier.amount).div(billingUnits);
		amount = amount.plus(rate.mul(tierSize));
		remaining = remaining.minus(tierSize);

		if (tier.to !== Infinite && tier.to !== -1) {
			lastTierTo = tier.to;
		}
	}

	return amount.toDecimalPlaces(10).toNumber();
};
