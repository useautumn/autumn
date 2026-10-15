import type { FullCusProduct } from "../../../../models/cusProductModels/cusProductModels.js";
import {
	isCustomerProductAddOn,
	isCustomerProductPaid,
	isCustomerProductPaidRecurring,
} from "../../../../utils/cusProductUtils/classifyCustomerProduct/classifyCustomerProduct.js";
import {
	cusProductToEnts,
	cusProductToPrices,
} from "../../../../utils/cusProductUtils/convertCusProduct.js";
import { pricesAndEntitlementsToBasePriceAndEntitlementPrices } from "../../../../utils/productUtils/entitlementPriceUtils/convertEntitlementPrice/pricesAndEntitlementsToBasePriceAndEntitlementPrices.js";
import { stringMatcherMatches } from "../../../migrations/filters/match/index.js";
import { numberMatcherMatches } from "../../../migrations/filters/match/numberMatcherMatches.js";
import type { PlanFilter } from "../../../migrations/filters/planFilter.js";
import { basePriceFilterMatches } from "./basePriceFilterMatches.js";
import { itemFilterMatchesEntitlementPrices } from "./itemFilterMatchesEntitlementPrices.js";

/**
 * Predicate: does `filter` match `cusProduct`?
 *
 * JS-side mirror of `compilePlanFilter` for callers that already have
 * the cusproduct in memory (migration runner, scripts, approval rules).
 * Supports every `PlanFilter` field, including `item` shapes the compiler
 * doesn't yet (`$every` / `$none`, `unlimited`, `price.billing_method`).
 */
export const planFilterMatchesCustomerProduct = ({
	filter,
	cusProduct,
}: {
	filter: PlanFilter;
	cusProduct: FullCusProduct;
}): boolean => {
	if (cusProduct.customer_license_link_id != null) return false;

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

	if (
		filter.price !== undefined &&
		!basePriceFilterMatches({
			filter: filter.price,
			prices: cusProductToPrices({ cusProduct }),
		})
	) {
		return false;
	}

	if (filter.item !== undefined) {
		const { entitlementPrices } =
			pricesAndEntitlementsToBasePriceAndEntitlementPrices({
				prices: cusProductToPrices({ cusProduct }),
				entitlements: cusProductToEnts({ cusProduct }),
			});
		const itemsMatch = itemFilterMatchesEntitlementPrices({
			filter: filter.item,
			entitlementPrices,
		});
		if (!itemsMatch) return false;
	}

	return true;
};
