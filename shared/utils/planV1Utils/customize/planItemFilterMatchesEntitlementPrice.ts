import type { PlanItemFilter } from "@api/products/items/filter/planItemFilter.js";
import type { EntitlementPrice } from "@utils/productUtils/entitlementPriceUtils/entitlementPriceTypes.js";
import { priceToBillingMethod } from "@utils/productUtils/priceUtils/convertPriceUtils.js";
import { entIntvToResetIntv } from "@utils/productV2Utils/productItemUtils/convertProductItem/planItemIntervals.js";

/** Specified filter fields must all match. Omitted fields are wildcards. */
export const planItemFilterMatchesEntitlementPrice = ({
	filter,
	entitlementPrice,
}: {
	filter: PlanItemFilter;
	entitlementPrice: EntitlementPrice;
}): boolean => {
	const { entitlement, price } = entitlementPrice;

	if (
		filter.feature_id !== undefined &&
		filter.feature_id !== entitlement.feature_id
	) {
		return false;
	}

	if (filter.billing_method !== undefined) {
		if (priceToBillingMethod({ price }) !== filter.billing_method) {
			return false;
		}
	}

	if (filter.interval !== undefined) {
		const entitlementResetInterval = entIntvToResetIntv({
			entInterval: entitlement.interval,
		});
		if (String(entitlementResetInterval) !== String(filter.interval)) {
			return false;
		}
	}

	if (
		filter.interval_count !== undefined &&
		(entitlement.interval_count ?? 1) !== filter.interval_count
	) {
		return false;
	}

	return true;
};
