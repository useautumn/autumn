import type { FullProduct } from "../../../../models/productModels/productModels.js";
import {
	isFreeProduct,
	isOneOffProduct,
} from "../../../../utils/productUtils/classifyProduct/classifyProductUtils.js";
import { pricesAndEntitlementsToBasePriceAndEntitlementPrices } from "../../../../utils/productUtils/entitlementPriceUtils/convertEntitlementPrice/pricesAndEntitlementsToBasePriceAndEntitlementPrices.js";
import { stringMatcherMatches } from "../../../migrations/filters/match/index.js";
import { numberMatcherMatches } from "../../../migrations/filters/match/numberMatcherMatches.js";
import type { PlanFilter } from "../../../migrations/filters/planFilter.js";
import { basePriceFilterMatches } from "./basePriceFilterMatches.js";
import { itemFilterMatchesEntitlementPrices } from "./itemFilterMatchesEntitlementPrices.js";

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

	const paid = !isFreeProduct({ product });
	if (filter.paid !== undefined && paid !== filter.paid) {
		return false;
	}

	if (filter.addon !== undefined && product.is_add_on !== filter.addon) {
		return false;
	}

	const recurring = !isOneOffProduct({ product });
	if (filter.recurring !== undefined && recurring !== filter.recurring) {
		return false;
	}

	if (
		filter.price !== undefined &&
		!basePriceFilterMatches({ filter: filter.price, prices: product.prices })
	) {
		return false;
	}

	if (filter.item !== undefined) {
		const { entitlementPrices } =
			pricesAndEntitlementsToBasePriceAndEntitlementPrices({
				prices: product.prices,
				entitlements: product.entitlements,
			});
		const itemsMatch = itemFilterMatchesEntitlementPrices({
			filter: filter.item,
			entitlementPrices,
		});
		if (!itemsMatch) return false;
	}

	return true;
};
