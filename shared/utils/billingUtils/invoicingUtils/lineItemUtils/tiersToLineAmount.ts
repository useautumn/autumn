import { priceAmountsForCurrency } from "@models/productModels/priceModels/priceConfig/priceCurrencyView";
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
 * - **Volume, pay-per-use**: `overage` is net of allowance and `allowance` is
 *   omitted. The stored tiers are net of included, so the band is picked from
 *   total usage and only the overage is charged at that band's rate.
 * - **Volume, prepaid**: `overage` is total quantity (purchased + allowance)
 *   and `allowance` prepends a free $0 tier and shifts boundaries. If total
 *   exceeds the free tier, the ENTIRE quantity (including included) is charged.
 *
 * Callers (e.g. `usagePriceToLineItem`) are responsible for adjusting
 * `overage` before calling — prepaid volume adds allowance to overage,
 * everything else does not.
 */
export const tiersToLineAmount = ({
	price,
	overage,
	allowance = 0,
	billingUnits = 1,
	currency,
}: {
	price: Price;
	overage: number;
	allowance?: number;
	billingUnits?: number;
	currency?: string;
}): number => {
	const tiers =
		priceAmountsForCurrency({ config: price.config, currency }).usage_tiers ??
		price.config.usage_tiers;
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
