import type { FullCusProduct, PlanFilter } from "@autumn/shared";
import { matchStringMatcher } from "./matchStringMatcher.js";

/**
 * JS-side PlanFilter matcher against a single FullCusProduct. Phase 1
 * supports `plan_id` only — `price`, `paid`, `recurring`, `item`, `$or`
 * throw `not_supported_in_matcher` so callers see the gap explicitly.
 */
export const matchPlanFilter = (
	filter: PlanFilter,
	cusProduct: FullCusProduct,
): boolean => {
	if (filter.plan_id !== undefined) {
		if (!matchStringMatcher(filter.plan_id, cusProduct.product_id))
			return false;
	}

	const unsupported = ["price", "paid", "recurring", "item", "$or"] as const;
	for (const key of unsupported) {
		if ((filter as Record<string, unknown>)[key] !== undefined)
			throw new Error(
				`matchPlanFilter: target.${key} not supported in JS matcher yet`,
			);
	}
	return true;
};

/** Returns the cusproducts on a customer that match `target`. */
export const matchCustomerProductsByTarget = ({
	cusProducts,
	target,
}: {
	cusProducts: FullCusProduct[];
	target: PlanFilter;
}): FullCusProduct[] => cusProducts.filter((cp) => matchPlanFilter(target, cp));
