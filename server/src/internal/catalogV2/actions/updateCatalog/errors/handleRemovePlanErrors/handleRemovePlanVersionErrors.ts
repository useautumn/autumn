import { ErrCode, RecaseError } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

/**
 * Historical versions stay put — removing one would leave a gap in the version
 * sequence. Pin the latest, or omit `version` to take the whole plan.
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

		const latestVersion =
			productStatesContext.versionsByPlanId[removePlan.planId]?.[0]?.version;
		if (latestVersion === undefined || removePlan.version === latestVersion) {
			continue;
		}

		throw new RecaseError({
			message: `Cannot remove version ${removePlan.version} of plan ${removePlan.planId}: only the latest version (${latestVersion}) can be removed. Omit "version" to remove the whole plan.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
