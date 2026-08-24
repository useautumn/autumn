import type { PlanItemFilter } from "@api/products/items/filter/planItemFilter.js";
import type { EntitlementPrice } from "@utils/productUtils/entitlementPriceUtils/entitlementPriceTypes.js";
import { pairRemovedAndAddedPlanItems } from "./pairRemovedAndAddedPlanItems.js";

/** Drop a paired replace-add when its remove filter did not hit a live row.
 * Leftover adds (boolean, other cadence) always stay. */
export const keepAddEntitlementPricesForLiveRemoves = ({
	removeItems,
	addEntitlementPrices,
	removeFilterMatchedLive,
}: {
	removeItems: PlanItemFilter[];
	addEntitlementPrices: EntitlementPrice[];
	removeFilterMatchedLive: ({ filter }: { filter: PlanItemFilter }) => boolean;
}): EntitlementPrice[] => {
	const { replaced, leftoverAdds } = pairRemovedAndAddedPlanItems({
		removeItems,
		addEntitlementPrices,
	});

	return [
		...replaced
			.filter(({ from }) => removeFilterMatchedLive({ filter: from }))
			.map(({ to }) => to),
		...leftoverAdds,
	];
};
