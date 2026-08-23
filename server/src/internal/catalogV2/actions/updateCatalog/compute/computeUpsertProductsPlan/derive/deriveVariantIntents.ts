import { computeVariantPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeVariantPlan/computeVariantPlan";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/**
 * Declared variants[] + propagate.variants on a folded base.
 * Missing ids with a name → create. Existing ids → follow and/or declare.
 * Nested bases emit nothing.
 */
export const deriveVariantIntents = ({
	intent,
	upsert,
	projectedProductStatesContext,
}: {
	intent: ProductUpsertIntent;
	upsert: UpsertProductPlan;
	projectedProductStatesContext: ProductStatesContext;
}): ProductUpsertIntent[] => {
	if (upsert.row.nextFullProduct.base_internal_product_id) return [];

	return computeVariantPlan({
		intent,
		upsert,
		projectedProductStatesContext,
	});
};
