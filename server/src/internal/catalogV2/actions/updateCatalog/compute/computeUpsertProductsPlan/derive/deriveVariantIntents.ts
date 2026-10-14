import { computeVariantPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeVariantPlan/computeVariantPlan";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

export const deriveVariantIntents = ({
	intent,
	upsert,
	projectedProductStatesContext,
	claimedProductKeys,
}: {
	intent: ProductUpsertIntent;
	upsert: UpsertProductPlan;
	projectedProductStatesContext: ProductStatesContext;
	claimedProductKeys?: Set<string>;
}): ProductUpsertIntent[] => {
	if (upsert.row.nextFullProduct.base_internal_product_id) return [];

	return computeVariantPlan({
		intent,
		upsert,
		projectedProductStatesContext,
		claimedProductKeys,
	});
};
