import { ErrCode, RecaseError } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { activeVersionForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/activeVersionForPlan";

/**
 * Only the active version can be removed. Omit `version` to take the whole plan.
 */
export const handleRemovePlanVersionErrors = ({
	updateCatalogPlan,
	productStatesContext,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
	productStatesContext: ProductStatesContext;
}): void => {
	for (const removePlan of updateCatalogPlan.removePlans) {
		if (removePlan.allVersions) continue;

		const activeVersion = activeVersionForPlan({
			planId: removePlan.planId,
			productStatesContext,
		});
		if (activeVersion === undefined || removePlan.version === activeVersion) {
			continue;
		}

		throw new RecaseError({
			message: `Cannot remove version ${removePlan.version} of plan ${removePlan.planId}: only the latest version (${activeVersion}) can be removed. Omit "version" to remove the whole plan.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
