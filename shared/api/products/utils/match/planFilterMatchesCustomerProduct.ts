import type { FullCusProduct } from "../../../../models/cusProductModels/cusProductModels.js";
import {
	isCustomerProductAddOn,
	isCustomerProductPaid,
	isCustomerProductPaidRecurring,
} from "../../../../utils/cusProductUtils/classifyCustomerProduct/classifyCustomerProduct.js";
import { numberMatcherMatches } from "../../../migrations/filters/match/numberMatcherMatches.js";
import { stringMatcherMatches } from "../../../migrations/filters/match/index.js";
import type { PlanFilter } from "../../../migrations/filters/planFilter.js";

/**
 * Predicate: does `filter` match `cusProduct`?
 *
 * JS-side mirror of `compilePlanFilter` for callers that already have
 * the cusproduct in memory (migration runner, scripts). Today supports
 * `plan_id`, `addon`, `paid`, `recurring`, `custom`, and `$or`; `price`
 * and `item` throw to make the gap explicit.
 */
export const planFilterMatchesCustomerProduct = ({
	filter,
	cusProduct,
}: {
	filter: PlanFilter;
	cusProduct: FullCusProduct;
}): boolean => {
	if (filter.$or !== undefined) {
		if (
			!filter.$or.some((subFilter) =>
				planFilterMatchesCustomerProduct({ filter: subFilter, cusProduct }),
			)
		) {
			return false;
		}
	}

	if (filter.plan_id !== undefined) {
		if (
			!stringMatcherMatches({
				matcher: filter.plan_id,
				value: cusProduct.product_id,
			})
		)
			return false;
	}

	if (filter.version !== undefined) {
		if (
			!numberMatcherMatches({
				matcher: filter.version,
				value: cusProduct.product?.version ?? null,
			})
		)
			return false;
	}

	if (
		filter.addon !== undefined &&
		isCustomerProductAddOn(cusProduct) !== filter.addon
	) {
		return false;
	}

	if (
		filter.paid !== undefined &&
		isCustomerProductPaid(cusProduct) !== filter.paid
	) {
		return false;
	}

	if (
		filter.recurring !== undefined &&
		isCustomerProductPaidRecurring(cusProduct) !== filter.recurring
	) {
		return false;
	}

	if (filter.custom !== undefined && cusProduct.is_custom !== filter.custom) {
		return false;
	}

	const unsupported = ["price", "item"] as const;
	for (const key of unsupported) {
		if ((filter as Record<string, unknown>)[key] !== undefined)
			throw new Error(
				`planFilterMatchesCustomerProduct: filter.${key} not supported in JS matcher yet`,
			);
	}
	return true;
};
