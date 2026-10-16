import type { Price } from "../../../../models/productModels/priceModels/priceModels.js";
import { nullableFieldMatches } from "../../../common/filters/match/index.js";
import type { PlanFilter } from "../../../migrations/filters/planFilter.js";

/**
 * Predicate: does the plan's BASE price satisfy `filter`? The base price is
 * the one with no `entitlement_id`, exactly as `PLAN_BASE_PRICE_SQL` defines it.
 */
export const basePriceFilterMatches = ({
	filter,
	prices,
}: {
	filter: PlanFilter["price"];
	prices: Price[];
}): boolean =>
	nullableFieldMatches({
		filter,
		value: prices.find((price) => price.entitlement_id == null),
		innerMatches: () => true,
	});
