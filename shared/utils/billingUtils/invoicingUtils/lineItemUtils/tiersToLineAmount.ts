import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { volumeTiersToLineAmount } from "@utils/billingUtils/invoicingUtils/lineItemUtils/volumeTiersToLineAmount";
import type { Price } from "../../../../models/productModels/priceModels/priceModels";
import { nullish } from "../../../utils";
import { graduatedTiersToLineAmount } from "./graduatedTiersToLineAmount";

/**
 * Translates a price's overage quantity into a dollar amount using the price's
 * tier behaviour (graduated or volume). Called at invoicing time for both
 * prepaid and pay-per-use prices.
 *
 * "Overage" here means any usage that exceeds the customer's free included
 * allowance (if any). For **prepaid** prices this is the quantity purchased
 * upfront above the free tier. For **pay-per-use** (arrear) prices this is
 * total consumption minus any included free units.
 *
 * Negative overage is allowed — used when a downgrade or proration produces a
 * credit line-item that needs to be negated.
 *
 * @param price - The price whose `config.usage_tiers` defines the rate schedule.
 * @param overage - Units to price. Positive = charge, negative = credit.
 *   Must be net of any included free allowance before calling.
 * @param billingUnits - Passed through to the underlying tier calculator.
 *   Defaults to 1 (per-unit pricing).
 * @returns Dollar amount (positive = charge, negative = credit).
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
	const isVolume = price.tier_behavior === TierBehavior.VolumeBased;

	if (nullish(tiers)) {
		throw new Error(
			"[tiersToLineAmount] usage_tiers required for usage-based or prepaid prices",
		);
	}

	if (isVolume) {
		return volumeTiersToLineAmount({
			tiers,
			usage: overage,
			billingUnits,
			allowNegative: true,
		});
	}

	return graduatedTiersToLineAmount({
		tiers,
		usage: overage,
		billingUnits,
		allowNegative: true,
	});
};
