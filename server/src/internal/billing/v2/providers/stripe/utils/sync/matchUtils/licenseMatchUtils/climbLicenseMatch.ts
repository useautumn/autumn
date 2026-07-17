import {
	type FullProduct,
	type ParentPlanLicense,
	type Price,
	productToBasePrice,
} from "@autumn/shared";
import type { ItemMatch } from "@/internal/billing/v2/actions/sync/detect/types";
import type { StripeItemSnapshot } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/types";
import {
	isAutumnPlanMatch,
	isAutumnPriceMatch,
	matchesOnBasePrice,
} from "../classifyItemMatch";
import { stripeItemMatchesBasePrice } from "../findProductLevelMatchForStripeItem";

/** Multiple parents require exactly one effective base-price shape match. */
const findShapeMatchedLink = ({
	links,
	licenseProduct,
	item,
}: {
	links: ParentPlanLicense[];
	licenseProduct: FullProduct;
	item: StripeItemSnapshot;
}): { link: ParentPlanLicense; price: Price } | null => {
	const matches: { link: ParentPlanLicense; price: Price }[] = [];
	for (const link of links) {
		const effectiveProduct = link.customized
			? { ...licenseProduct, prices: link.license_prices }
			: licenseProduct;
		const price = productToBasePrice({ product: effectiveProduct });
		if (
			price &&
			stripeItemMatchesBasePrice({
				item,
				basePrice: price,
				stripeProductId: item.stripe_product_id,
			})
		) {
			matches.push({ link, price });
		}
	}
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
