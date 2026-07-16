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

const composeProductItems = ({ excludeEnts = false } = {}) => ({
	entitlements: excludeEnts
		? undefined
		: {
				with: { feature: true as const },
				where: eq(entitlements.is_custom, false),
			},
	prices: { where: eq(prices.is_custom, false) },
	free_trials: { where: eq(freeTrials.is_custom, false) },
});

export const composeFullProductQuery = ({
	excludeEnts = false,
}: {
	excludeEnts?: boolean;
} = {}) => ({
	...composeProductItems({ excludeEnts }),
	licenses: {
		where: eq(planLicenses.is_custom, false),
		with: {
			product: {
				with: composeProductItems(),
			},
		},
	},
	// Reverse direction: links where this product IS the license. Indexed by
	// idx_plan_license_license — an empty probe for non-license products.
	parent_plan_licenses: {
		where: eq(planLicenses.is_custom, false),
		with: {
			parentProduct: {
				with: composeProductItems(),
			},
		},
	},
});

export type ProductWithLicenseRelations = FullProductWithoutLicenses & {
	licenses?: Array<DbPlanLicense & { product: FullProductWithoutLicenses }>;
	parent_plan_licenses?: Array<
		DbPlanLicense & { parentProduct: FullProductWithoutLicenses }
	>;
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

export const normalizeFullProductLicenses = ({
	product,
}: {
	product: ProductWithLicenseRelations;
}): FullProduct => {
	const { parent_plan_licenses, ...rest } = product;
	return {
		...rest,
		licenses: product.licenses?.map(
			(link): FullPlanLicense => normalizeLinkProduct(link, link.product),
		),
		parent_plan_licenses: parent_plan_licenses?.map(
			({ parentProduct, ...link }): ParentPlanLicense =>
				normalizeLinkProduct(link, parentProduct),
		),
	};
};
