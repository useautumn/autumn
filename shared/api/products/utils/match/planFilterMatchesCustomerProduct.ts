import type { FullCusProduct } from "../../../../models/cusProductModels/cusProductModels.js";
import {
	isCustomerProductAddOn,
	isCustomerProductPaid,
	isCustomerProductPaidRecurring,
} from "../../../../utils/cusProductUtils/classifyCustomerProduct/classifyCustomerProduct.js";
import { cusProductToPrices } from "../../../../utils/cusProductUtils/convertCusProduct.js";
import { stringMatcherMatches } from "../../../migrations/filters/match/index.js";
import { numberMatcherMatches } from "../../../migrations/filters/match/numberMatcherMatches.js";
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

	// Null-existence forms only: `price` asks whether a BASE customer price
	// (price with entitlement_id null) exists — mirrors the compiler's SQL.
	if (filter.price !== undefined) {
		const hasBasePrice = cusProductToPrices({ cusProduct }).some(
			(price) => price.entitlement_id == null,
		);
		if (filter.price === null) {
			if (hasBasePrice) return false;
		} else if (isPriceNullExistenceMatcher(filter.price)) {
			if ("$ne" in filter.price && filter.price.$ne === null && !hasBasePrice)
				return false;
			if ("$eq" in filter.price && filter.price.$eq === null && hasBasePrice)
				return false;
		} else {
			throw new Error(
				"planFilterMatchesCustomerProduct: nested price filters not supported in JS matcher yet",
			);
		}
	}

	if (filter.item !== undefined)
		throw new Error(
			"planFilterMatchesCustomerProduct: filter.item not supported in JS matcher yet",
		);
	return true;
};

const isPriceNullExistenceMatcher = (
	price: NonNullable<PlanFilter["price"]>,
): price is { $eq?: null; $ne?: null } =>
	typeof price === "object" && ("$eq" in price || "$ne" in price);
