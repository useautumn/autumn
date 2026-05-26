import type { FullProduct } from "../../../../models/productModels/productModels.js";
import {
	isFreeProduct,
	isOneOffProduct,
} from "../../../../utils/productUtils/classifyProduct/classifyProductUtils.js";
import { numberMatcherMatches } from "../../../migrations/filters/match/numberMatcherMatches.js";
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

	if (filter.version !== undefined) {
		if (
			!numberMatcherMatches({
				matcher: filter.version,
				value: product.version ?? null,
			})
		) {
			return false;
		}
	}

	const paid = !isFreeProduct({ prices: product.prices });
	if (filter.paid !== undefined && paid !== filter.paid) {
		return false;
	}

	if (filter.addon !== undefined && product.is_add_on !== filter.addon) {
		return false;
	}

	const recurring = !isOneOffProduct({ prices: product.prices });
	if (filter.recurring !== undefined && recurring !== filter.recurring) {
		return false;
	}

	const unsupported = ["price", "item"] as const;
	for (const key of unsupported) {
		if ((filter as Record<string, unknown>)[key] !== undefined) {
			throw new Error(
				`planFilterMatchesProduct: filter.${key} not supported in JS matcher yet`,
			);
		}
	}

	return true;
};
