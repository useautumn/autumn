import { initVariantPlanParams } from "./initVariantPlanParams";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

const latestVersion = ({
	planId,
	productStatesContext,
}: {
	planId: string;
	productStatesContext: ProductStatesContext;
}): number | undefined =>
	productStatesContext.versionsByPlanId[planId]?.[0]?.version;

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
			latestVersion({
				planId: variant.variant_plan_id,
				productStatesContext: projectedProductStatesContext,
			}) !== undefined
		) {
			return [];
		}
		if (!variant.name) return [];

		return [
			{
				productKey: { planId: variant.variant_plan_id, version: 1 },
				planParams: initVariantPlanParams({
					variant,
					baseFullProduct: upsert.row.nextFullProduct,
				}),
				source: "variant_link" as const,
				baseInternalProductId: upsert.row.nextFullProduct.internal_id,
			},
		];
	});
