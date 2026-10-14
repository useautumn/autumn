import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { editedBaseInternalIds } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/editedBaseInternalIds";
import { initVariantPlanParams } from "./initVariantPlanParams";
import { variantCreateTarget } from "./variantCreateTarget";

export const deriveVariantCreates = ({
	upsert,
	projectedProductStatesContext,
	claimedProductKeys,
}: {
	upsert: UpsertProductPlan;
	projectedProductStatesContext: ProductStatesContext;
	claimedProductKeys?: Set<string>;
}): ProductUpsertIntent[] => {
	const anchorInternalIds = editedBaseInternalIds({ upsert });
	return (upsert.declaredVariants ?? []).flatMap(
		(variant): ProductUpsertIntent[] => {
			const target = variantCreateTarget({
				variant,
				anchorInternalIds,
				baseVersionSlug: upsert.row.nextFullProduct.version_slug ?? undefined,
				productStatesContext: projectedProductStatesContext,
				claimedProductKeys,
			});
			if (!target) return [];

			return [
				{
					productKey: {
						planId: variant.variant_plan_id,
						version: target.version,
					},
					planParams: {
						...initVariantPlanParams({
							variant,
							baseFullProduct: upsert.row.nextFullProduct,
							declaredLicenses: upsert.declaredLicenses,
						}),
						version: target.version,
						...(target.previous
							? { name: variant.name ?? target.previous.name }
							: {}),
						...(target.version > 1
							? { active: upsert.row.nextFullProduct.active }
							: {}),
						...(target.newVersionSlug
							? { new_version_slug: target.newVersionSlug }
							: {}),
						...(upsert.createInStripe !== undefined
							? { create_in_stripe: upsert.createInStripe }
							: {}),
					},
					source: "variant_link" as const,
					baseInternalProductId: upsert.row.nextFullProduct.internal_id,
				},
			];
		},
	);
};
