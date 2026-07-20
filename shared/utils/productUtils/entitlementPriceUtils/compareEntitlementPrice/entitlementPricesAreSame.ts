import { entsAreSame } from "@utils/productUtils/entUtils/compareEnt/entsAreSame.js";
import { pricesAreSame } from "@utils/productUtils/priceUtils/comparePrice/pricesAreSame.js";
import type { EntitlementPrice } from "../entitlementPriceTypes.js";

export const entitlementPricesAreSame = ({
	entitlementPrice1,
	entitlementPrice2,
}: {
	entitlementPrice1: EntitlementPrice;
	entitlementPrice2: EntitlementPrice;
}) => {
	if (
		!entsAreSame(
			entitlementPrice1.entitlement,
			entitlementPrice2.entitlement,
		)
	) {
		return false;
	}

	if (!entitlementPrice1.price && !entitlementPrice2.price) return true;
	if (!entitlementPrice1.price || !entitlementPrice2.price) return false;
	return pricesAreSame(entitlementPrice1.price, entitlementPrice2.price);
};
