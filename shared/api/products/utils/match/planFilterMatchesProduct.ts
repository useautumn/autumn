import type { FullProduct } from "../../../../models/productModels/productModels.js";
import { stringMatcherMatches } from "../../../migrations/filters/match/index.js";
import type { PlanFilter } from "../../../migrations/filters/planFilter.js";

export const planFilterMatchesProduct = ({
	filter,
	product,
}: {
	filter: PlanFilter;
	product: FullProduct;
}): boolean => {
	if (filter.$or !== undefined) {
		if (
			!filter.$or.some((subFilter) =>
				planFilterMatchesProduct({ filter: subFilter, product }),
			)
		) {
			return false;
		}
	}

	if (filter.plan_id !== undefined) {
		if (
			!stringMatcherMatches({
				matcher: filter.plan_id,
				value: product.id,
			})
		) {
			return false;
		}
	}

	const unsupported = ["price", "paid", "recurring", "item"] as const;
	for (const key of unsupported) {
		if ((filter as Record<string, unknown>)[key] !== undefined) {
			throw new Error(
				`planFilterMatchesProduct: filter.${key} not supported in JS matcher yet`,
			);
		}
	}

	return true;
};
