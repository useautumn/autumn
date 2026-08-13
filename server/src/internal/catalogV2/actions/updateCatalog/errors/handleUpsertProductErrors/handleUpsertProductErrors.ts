import { handleDefaultFlagErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductErrors/handleDefaultFlagErrors";
import { handleFreeTrialErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductErrors/handleFreeTrialErrors";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

/** Projected-state guards for each upsertProducts row. */
export const handleUpsertProductErrors = ({
	updateCatalogPlan,
	productStatesContext,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
	productStatesContext: ProductStatesContext;
}): void => {
	for (const upsert of updateCatalogPlan.upsertProducts) {
		const { nextFullProduct } = upsert.row;
		const latestExistingVersion =
			productStatesContext.versionsByPlanId[upsert.row.planId]?.[0]?.version;

		// 1. Free trial errors (one-off products cannot trial)
		handleFreeTrialErrors({ nextFullProduct });

		// 2. Default flag errors (historical version; paid default)
		handleDefaultFlagErrors({ nextFullProduct, latestExistingVersion });
	}
};
