import {
	type DbPlanLicense,
	entitlements,
	type FullPlanLicense,
	type FullProduct,
	type FullProductWithoutLicenses,
	freeTrials,
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
});

export type ProductWithLicenseRelations = FullProductWithoutLicenses & {
	licenses?: Array<
		DbPlanLicense & {
			product: FullProductWithoutLicenses;
		}
	>;
};

export const normalizeFullProductLicenses = ({
	product,
}: {
	product: ProductWithLicenseRelations;
}): FullProduct => ({
	...product,
	licenses: product.licenses?.map(
		(link): FullPlanLicense => ({
			...link,
			product: {
				...link.product,
				free_trial: link.product.free_trials?.[0] ?? null,
			},
		}),
	),
});
