import type { EntitlementPrice } from "../../../../utils/productUtils/entitlementPriceUtils/entitlementPriceTypes.js";
import { isUnlimitedEntitlement } from "../../../../utils/productUtils/entUtils/classifyEntUtils.js";
import { priceToBillingMethod } from "../../../../utils/productUtils/priceUtils/convertPriceUtils.js";
import {
	nullableFieldMatches,
	stringMatcherMatches,
} from "../../../migrations/filters/match/index.js";
import type { PlanItemFilter } from "../../../migrations/filters/planItemFilter.js";

/**
 * Predicate: does one plan item (an entitlement plus its optional price)
 * match `filter`? Mirrors the compiler's item scope: an item is an
 * entitlement, and `price` is the price linked to it by `entitlement_id`.
 */
export const itemFilterMatchesEntitlementPrice = ({
	filter,
	entitlementPrice,
}: {
	filter: PlanItemFilter;
	entitlementPrice: EntitlementPrice;
}): boolean => {
	const { entitlement, price } = entitlementPrice;

	const featureMatches = stringMatcherMatches({
		matcher: filter.feature_id,
		value: entitlement.feature_id,
	});
	if (!featureMatches) return false;

	const unlimitedMatches =
		filter.unlimited === undefined ||
		isUnlimitedEntitlement({ entitlement }) === filter.unlimited;
	if (!unlimitedMatches) return false;

	const priceMatches = nullableFieldMatches({
		filter: filter.price,
		value: price,
		innerMatches: ({ filter: priceFilter }) =>
			stringMatcherMatches({
				matcher: priceFilter.billing_method,
				value: priceToBillingMethod({ price }),
			}),
	});
	if (!priceMatches) return false;

	return nullableFieldMatches({
		filter: filter.rollover,
		value: entitlement.rollover,
		innerMatches: () => true,
	});
};
