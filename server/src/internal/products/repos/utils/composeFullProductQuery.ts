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
import { eq, isNull } from "drizzle-orm";

const composeProductItems = () => ({
	entitlements: {
		with: { feature: true as const },
		where: eq(entitlements.is_custom, false),
	},
	prices: { where: eq(prices.is_custom, false) },
	free_trials: { where: eq(freeTrials.is_custom, false) },
});

export const composeFullProductQuery = ({
	includeLicenses = false,
}: {
	includeLicenses?: boolean;
} = {}) => ({
	...composeProductItems(),
	licenses: includeLicenses
		? {
				where: isNull(planLicenses.parent_customer_product_id),
				with: {
					product: {
						with: composeProductItems(),
					},
				},
			}
		: undefined,
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
			id: link.id,
			parent_plan_id: product.id,
			license_plan_id: link.product.id,
			included: link.included,
			prepaid_only: link.prepaid_only,
			metadata: link.metadata,
			created_at: link.created_at,
			updated_at: link.updated_at,
			product: {
				...link.product,
				free_trial: link.product.free_trials?.[0] ?? null,
			},
		}),
	),
});
