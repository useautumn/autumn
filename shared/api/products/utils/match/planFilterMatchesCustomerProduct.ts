import type { FullCusProduct } from "../../../../models/cusProductModels/cusProductModels.js";
import { stringMatcherMatches } from "../../../migrations/filters/match/index.js";
import type { PlanFilter } from "../../../migrations/filters/planFilter.js";

/**
 * Predicate: does `filter` match `cusProduct`?
 *
 * JS-side mirror of `compilePlanFilter` for callers that already have
 * the cusproduct in memory (migration runner, scripts). Today supports
 * `plan_id` only — `price`, `paid`, `recurring`, `item`, `$or` throw to
 * make the gap explicit.
 */
export const planFilterMatchesCustomerProduct = ({
	filter,
	cusProduct,
}: {
	filter: PlanFilter;
	cusProduct: FullCusProduct;
}): boolean => {
	if (filter.plan_id !== undefined) {
		if (
			!stringMatcherMatches({
				matcher: filter.plan_id,
				value: cusProduct.product_id,
			})
		)
			return false;
	}

	const unsupported = ["price", "paid", "recurring", "item", "$or"] as const;
	for (const key of unsupported) {
		if ((filter as Record<string, unknown>)[key] !== undefined)
			throw new Error(
				`planFilterMatchesCustomerProduct: filter.${key} not supported in JS matcher yet`,
			);
	}
	return true;
};
