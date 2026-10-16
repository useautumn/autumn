import type { EntitlementPrice } from "../../../../utils/productUtils/entitlementPriceUtils/entitlementPriceTypes.js";
import { arrayFilterMatches } from "../../../common/filters/match/index.js";
import type { PlanFilter } from "../../../migrations/filters/planFilter.js";
import { itemFilterMatchesEntitlementPrice } from "./itemFilterMatchesEntitlementPrice.js";

/** Predicate: do a plan's items satisfy `filter` (bare = `$some`, or `$some` / `$every` / `$none`)? */
export const itemFilterMatchesEntitlementPrices = ({
	filter,
	entitlementPrices,
}: {
	filter: NonNullable<PlanFilter["item"]>;
	entitlementPrices: EntitlementPrice[];
}): boolean =>
	arrayFilterMatches({
		filter,
		items: entitlementPrices,
		matchesElement: ({ filter: itemFilter, item: entitlementPrice }) =>
			itemFilterMatchesEntitlementPrice({
				filter: itemFilter,
				entitlementPrice,
			}),
	});
