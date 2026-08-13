import { productToProductKey } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { ProductUpsertIntent } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/**
 * Version edge: a folded `all_versions` direct intent extends its edit to every
 * other existing version of the same plan.
 */
export const deriveVersionSiblingIntents = ({
	intent,
	projectedProductStatesContext,
}: {
	intent: ProductUpsertIntent;
	projectedProductStatesContext: ProductStatesContext;
}): ProductUpsertIntent[] => {
	if (intent.source !== "direct") return [];
	if (intent.planParams.versioning !== "all_versions") return [];

	const versions =
		projectedProductStatesContext.versionsByPlanId[intent.planParams.plan_id] ??
		[];

	return versions
		.filter((product) => product.version !== intent.productKey.version)
		.map((product) => ({
			productKey: productToProductKey({ product }),
			// Same content for every sibling; true version_diff derivation comes later.
			planParams: intent.planParams,
			source: "all_versions" as const,
		}));
};
