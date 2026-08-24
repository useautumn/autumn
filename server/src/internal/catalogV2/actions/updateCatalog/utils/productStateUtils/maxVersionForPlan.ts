import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";

/** Numeric tip for this plan_id (`MAX(version)`), or 0 if the plan is absent. */
export const maxVersionForPlan = ({
	planId,
	productStatesContext,
}: {
	planId: string;
	productStatesContext: ProductStatesContext;
}): number =>
	productStatesContext.maxVersionByPlanId?.[planId] ??
	productStatesContext.versionsByPlanId[planId]?.[0]?.version ??
	0;
