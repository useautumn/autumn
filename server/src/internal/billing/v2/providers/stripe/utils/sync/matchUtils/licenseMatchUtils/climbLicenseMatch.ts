import type { ItemMatch } from "@/internal/billing/v2/actions/sync/detect/types";
import {
	isAutumnPlanMatch,
	isAutumnPriceMatch,
	matchesOnBasePrice,
} from "../classifyItemMatch";

/**
 * Ladder climb: an item that hit a license plan — its base price (by id or
 * shape), or the product itself — belongs to the (single) parent plan
 * offering that license. Ambiguous ownership or feature-price hits stay
 * as-is and roll up standalone.
 */
export const climbLicenseMatch = (match: ItemMatch): ItemMatch => {
	if (!isAutumnPlanMatch(match)) return match;

	const links = match.product.parent_plan_licenses ?? [];
	if (links.length !== 1) return match;

	if (isAutumnPriceMatch(match) && !matchesOnBasePrice(match)) return match;

	return {
		kind: "autumn_license",
		matched_on: match.matched_on,
		price: isAutumnPriceMatch(match) ? match.price : null,
		product: match.product,
		parent_plan_license: links[0],
	};
};
