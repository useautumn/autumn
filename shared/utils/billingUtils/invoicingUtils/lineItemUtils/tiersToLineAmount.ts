import { priceAmountsForCurrency } from "@models/productModels/priceModels/priceConfig/priceCurrencyView";
import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { volumeTiersToLineAmount } from "@utils/billingUtils/invoicingUtils/lineItemUtils/volumeTiersToLineAmount";
import type { Price } from "../../../../models/productModels/priceModels/priceModels";
import { nullish } from "../../../utils";
import { graduatedTiersToLineAmount } from "./graduatedTiersToLineAmount";

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
