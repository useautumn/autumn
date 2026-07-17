import type { FullProduct } from "@autumn/shared";
import type { ItemMatch } from "@/internal/billing/v2/actions/sync/detect/types";
import type { StripeItemSnapshot } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/types";
import {
	isAutumnPlanMatch,
	isAutumnPriceMatch,
	matchesOnBasePrice,
} from "../classifyItemMatch";
import { findShapeMatchedLicenseLinks } from "./findLicenseMatchForStripeItem";

/** Multiple parents require exactly one effective base-price shape match. */
const findShapeMatchedLink = ({
	links,
	licenseProduct,
	item,
}: {
	links: NonNullable<FullProduct["parent_plan_licenses"]>;
	licenseProduct: FullProduct;
	item: StripeItemSnapshot;
}) => {
	const matches = findShapeMatchedLicenseLinks({
		links,
		licenseProduct,
		item,
	});
	return matches.length === 1 ? matches[0] : null;
};

export const climbLicenseMatch = ({
	match,
	item,
}: {
	match: ItemMatch;
	item: StripeItemSnapshot;
}): ItemMatch => {
	if (!isAutumnPlanMatch(match)) return match;

	const links = match.product.parent_plan_licenses ?? [];
	const shapeMatch = findShapeMatchedLink({
		links,
		licenseProduct: match.product,
		item,
	});
	if (links.length > 1 && !shapeMatch) return { kind: "none" };
	const parentPlanLicense =
		shapeMatch?.link ?? (links.length === 1 ? links[0] : null);
	if (!parentPlanLicense) return match;

	if (!shapeMatch && isAutumnPriceMatch(match) && !matchesOnBasePrice(match)) {
		return match;
	}

	return {
		kind: "autumn_license",
		matched_on: shapeMatch
			? {
					type: "stripe_base_price_shape",
					stripe_product_id: item.stripe_product_id,
					stripe_price_id: item.stripe_price_id,
				}
			: match.matched_on,
		price:
			shapeMatch?.price ?? (isAutumnPriceMatch(match) ? match.price : null),
		product: match.product,
		parent_plan_license: parentPlanLicense,
	};
};
