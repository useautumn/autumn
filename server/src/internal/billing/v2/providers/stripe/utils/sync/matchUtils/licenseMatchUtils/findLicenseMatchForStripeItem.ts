import {
	type FullProduct,
	getAllPriceStripeIds,
	type ParentPlanLicense,
	type Price,
	productToBasePrice,
	productToStripeIds,
} from "@autumn/shared";
import type { ItemMatch } from "@/internal/billing/v2/actions/sync/detect/types";
import type { StripeItemSnapshot } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/types";
import { stripeItemMatchesBasePrice } from "../findProductLevelMatchForStripeItem";

type LicenseLinkPriceMatch = {
	link: ParentPlanLicense;
	licenseProduct: FullProduct;
	price: Price;
};

const licenseLinkToBasePrice = ({
	link,
	licenseProduct,
}: {
	link: ParentPlanLicense;
	licenseProduct: FullProduct;
}): Price | null =>
	productToBasePrice({
		product: link.customized
			? { ...licenseProduct, prices: link.license_prices }
			: licenseProduct,
	});

const basePriceToStripeProductIds = ({
	price,
	link,
	licenseProduct,
}: LicenseLinkPriceMatch): string[] => {
	const stripeProductIds = [
		...(price.config.stripe_product_id ? [price.config.stripe_product_id] : []),
		...productToStripeIds({ product: licenseProduct }),
	];
	if (link.customized && price.is_custom) {
		stripeProductIds.push(...productToStripeIds({ product: link.product }));
	}
	return [...new Set(stripeProductIds)];
};

export const findShapeMatchedLicenseLinks = ({
	links,
	licenseProduct,
	item,
}: {
	links: ParentPlanLicense[];
	licenseProduct: FullProduct;
	item: StripeItemSnapshot;
}): LicenseLinkPriceMatch[] => {
	const matches: LicenseLinkPriceMatch[] = [];
	for (const link of links) {
		const price = licenseLinkToBasePrice({ link, licenseProduct });
		if (!price) continue;
		const candidate = { link, licenseProduct, price };
		if (
			basePriceToStripeProductIds(candidate).some((stripeProductId) =>
				stripeItemMatchesBasePrice({ item, basePrice: price, stripeProductId }),
			)
		) {
			matches.push(candidate);
		}
	}
	return matches;
};

const findExactLicenseLinks = ({
	fullProducts,
	item,
}: {
	fullProducts: FullProduct[];
	item: StripeItemSnapshot;
}): LicenseLinkPriceMatch[] => {
	const matches: LicenseLinkPriceMatch[] = [];
	for (const licenseProduct of fullProducts) {
		for (const link of licenseProduct.parent_plan_licenses ?? []) {
			const price = licenseLinkToBasePrice({ link, licenseProduct });
			if (!price) continue;
			if (
				getAllPriceStripeIds({ config: price.config }).includes(
					item.stripe_price_id,
				)
			) {
				matches.push({ link, licenseProduct, price });
			}
		}
	}
	return matches;
};

const licenseLinkMatchToItemMatch = ({
	match,
	item,
	exact,
}: {
	match: LicenseLinkPriceMatch;
	item: StripeItemSnapshot;
	exact: boolean;
}): ItemMatch => ({
	kind: "autumn_license",
	matched_on: exact
		? {
				type: "stripe_price_id",
				stripe_price_id: item.stripe_price_id,
			}
		: {
				type: "stripe_base_price_shape",
				stripe_product_id: item.stripe_product_id,
				stripe_price_id: item.stripe_price_id,
			},
	price: match.price,
	product: match.licenseProduct,
	parent_plan_license: match.link,
});

export const findLicenseMatchForStripeItem = ({
	fullProducts,
	item,
}: {
	fullProducts: FullProduct[];
	item: StripeItemSnapshot;
}): ItemMatch | null => {
	const exactMatches = findExactLicenseLinks({ fullProducts, item });
	if (exactMatches.length > 0) {
		return exactMatches.length === 1
			? licenseLinkMatchToItemMatch({
					match: exactMatches[0]!,
					item,
					exact: true,
				})
			: { kind: "none" };
	}

	const shapeMatches = fullProducts.flatMap((licenseProduct) =>
		findShapeMatchedLicenseLinks({
			links: licenseProduct.parent_plan_licenses ?? [],
			licenseProduct,
			item,
		}),
	);
	if (shapeMatches.length === 0) return null;
	return shapeMatches.length === 1
		? licenseLinkMatchToItemMatch({
				match: shapeMatches[0]!,
				item,
				exact: false,
			})
		: { kind: "none" };
};
