import {
	type DbPlanLicense,
	entitlements,
	type FullPlanLicense,
	type FullProduct,
	type FullProductWithoutLicenses,
	freeTrials,
	type ParentPlanLicense,
	planLicenses,
	prices,
} from "@autumn/shared";
import { eq } from "drizzle-orm";

const composeProductItems = () => ({
	entitlements: {
		with: { feature: true as const },
		where: eq(entitlements.is_custom, false),
	},
	prices: { where: eq(prices.is_custom, false) },
	free_trials: { where: eq(freeTrials.is_custom, false) },
});

const composeLicenseSide = () => ({
	licenses: {
		where: eq(planLicenses.is_custom, false),
		with: {
			product: {
				with: composeProductItems(),
			},
			entitlementRefs: {
				with: {
					entitlement: { with: { feature: true as const } },
				},
			},
			priceRefs: { with: { price: true as const } },
		},
	},
});

/** Nested base/variants: items + license plans. Skip parent_plan_licenses —
 * nesting that relation under base/variants hits a Postgres LATERAL alias bug. */
const composeNestedVariantProduct = () => ({
	...composeProductItems(),
	...composeLicenseSide(),
});

export const composeFullProductQuery = () => ({
	...composeProductItems(),
	...composeLicenseSide(),
	// Reverse direction: links where this product IS the license. Indexed by
	// idx_plan_license_license — an empty probe for non-license products.
	parent_plan_licenses: {
		where: eq(planLicenses.is_custom, false),
		with: {
			parentProduct: {
				with: composeProductItems(),
			},
			priceRefs: { with: { price: true as const } },
		},
	},
	base_product: {
		with: composeNestedVariantProduct(),
	},
	variants: {
		with: composeNestedVariantProduct(),
	},
});

export type ProductWithLicenseRelations = FullProductWithoutLicenses & {
	licenses?: Array<
		DbPlanLicense & {
			product: FullProductWithoutLicenses;
			entitlementRefs: Array<{
				entitlement: FullProductWithoutLicenses["entitlements"][number];
			}>;
			priceRefs: Array<{
				price: FullProductWithoutLicenses["prices"][number];
			}>;
		}
	>;
	parent_plan_licenses?: Array<
		DbPlanLicense & {
			parentProduct: FullProductWithoutLicenses;
			priceRefs: Array<{
				price: FullProductWithoutLicenses["prices"][number];
			}>;
		}
	>;
	base_product?: ProductWithLicenseRelations | null;
	variants?: ProductWithLicenseRelations[];
};

/** Hydrated link row + its product, with free_trial resolved. */
const normalizeLinkProduct = <T extends DbPlanLicense>(
	link: T,
	product: FullProductWithoutLicenses,
): DbPlanLicense & { product: FullProductWithoutLicenses } => ({
	...link,
	product: {
		...product,
		free_trial: product.free_trials?.[0] ?? null,
	},
});

const normalizeLicenseProduct = (
	link: NonNullable<ProductWithLicenseRelations["licenses"]>[number],
) => {
	const baseLink = normalizeLinkProduct(link, link.product);
	return {
		...normalizeLinkProduct(
			link,
			link.customized
				? {
						...link.product,
						prices: link.priceRefs.map(({ price }) => price),
						entitlements: link.entitlementRefs.map(
							({ entitlement }) => entitlement,
						),
					}
				: link.product,
		),
		...(link.customized ? { base_product: baseLink.product } : {}),
	};
};

export const normalizeFullProductLicenses = ({
	product,
}: {
	product: ProductWithLicenseRelations;
}): FullProduct => {
	const { parent_plan_licenses, base_product, variants, ...rest } = product;
	return {
		...rest,
		licenses: product.licenses?.map(
			(link): FullPlanLicense => normalizeLicenseProduct(link),
		),
		parent_plan_licenses: parent_plan_licenses?.map(
			({ parentProduct, priceRefs, ...link }): ParentPlanLicense => ({
				...normalizeLinkProduct(link, parentProduct),
				license_prices: priceRefs.map(({ price }) => price),
			}),
		),
		base_product: base_product
			? normalizeFullProductLicenses({ product: base_product })
			: null,
		variants: (variants ?? []).map((variant) =>
			normalizeFullProductLicenses({ product: variant }),
		),
	};
};
