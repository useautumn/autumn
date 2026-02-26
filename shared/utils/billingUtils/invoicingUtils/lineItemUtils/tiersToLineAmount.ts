import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { volumeTiersToLineAmount } from "@utils/billingUtils/invoicingUtils/lineItemUtils/volumeTiersToLineAmount";
import type { Price } from "../../../../models/productModels/priceModels/priceModels";
import { nullish } from "../../../utils";
import { graduatedTiersToLineAmount } from "./graduatedTiersToLineAmount";

/**
 * Translates usage into a dollar amount using the price's tier behaviour.
 *
 * - **Graduated**: `overage` should be net of allowance. Each tier band is
 *   charged at its own rate. `allowance` param is unused.
 * - **Volume**: `overage` should be total usage (purchased + allowance).
 *   `allowance` is passed through to prepend a free $0 tier and shift
 *   boundaries. If total exceeds the free tier, the ENTIRE quantity
 *   (including included) is charged at the matching tier's rate.
 *
 * Callers (e.g. `usagePriceToLineItem`) are responsible for adjusting
 * `overage` before calling — volume adds allowance to overage, graduated
 * does not.
 */
export const tiersToLineAmount = ({
	price,
	overage,
	allowance = 0,
	billingUnits = 1,
}: {
	price: Price;
	overage: number;
	allowance?: number;
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
			allowance,
		});
	}

	return graduatedTiersToLineAmount({
		tiers,
		usage: overage,
		billingUnits,
		allowNegative: true,
	});
};
