import { initVariantPlanParams } from "./initVariantPlanParams";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { maxVersionForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/maxVersionForPlan";

/** Missing ids with a name → `variant_link` create. Existing ids are edits. */
export const deriveVariantCreates = ({
	upsert,
	projectedProductStatesContext,
}: {
	upsert: UpsertProductPlan;
	projectedProductStatesContext: ProductStatesContext;
}): ProductUpsertIntent[] =>
	(upsert.declaredVariants ?? []).flatMap((variant) => {
		if (
			maxVersionForPlan({
				planId: variant.variant_plan_id,
				productStatesContext: projectedProductStatesContext,
			}) !== 0
		) {
			return [];
		}
		if (!variant.name) return [];

		return [
			{
				productKey: { planId: variant.variant_plan_id, version: 1 },
				planParams: {
					...initVariantPlanParams({
						variant,
						baseFullProduct: upsert.row.nextFullProduct,
						declaredLicenses: upsert.declaredLicenses,
					}),
					// Variant creates inherit the base's Stripe creation opt-out.
					...(upsert.createInStripe !== undefined
						? { create_in_stripe: upsert.createInStripe }
						: {}),
				},
				source: "variant_link" as const,
				baseInternalProductId: upsert.row.nextFullProduct.internal_id,
			},
		];
	});
