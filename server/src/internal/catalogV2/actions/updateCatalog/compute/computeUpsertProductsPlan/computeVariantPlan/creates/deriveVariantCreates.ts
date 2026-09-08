import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { editedBaseInternalIds } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/editedBaseInternalIds";
import { initVariantPlanParams } from "./initVariantPlanParams";
import { variantCreateTarget } from "./variantCreateTarget";

/**
 * variants[] entries naming a row the catalog does not have: a v1 create, or a
 * new version of the variant plan anchored to this base row. Existing rows are edits.
 */
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
						// A minted version takes `active` from the base row it hangs off;
						// the previous row may still be pending in this same push.
						...(target.version > 1
							? { active: upsert.row.nextFullProduct.active }
							: {}),
						...(target.newVersionSlug
							? { new_version_slug: target.newVersionSlug }
							: {}),
						// Variant creates inherit the base's Stripe creation opt-out.
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
