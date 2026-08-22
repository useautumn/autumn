import type { UpdateCatalogParams } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { RenameProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/renameProductPlan";

/**
 * One rename per existing plan with a differing new_plan_id. Creates carry
 * the new id on the row itself — no references exist yet, nothing to move.
 */
export const computeRenameProductIdsPlan = ({
	params,
	productStatesContext,
}: {
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
}): RenameProductPlan[] =>
	params.plans.flatMap((planParams) => {
		if (!planParams.new_plan_id) return [];
		if (planParams.new_plan_id === planParams.plan_id) return [];

		const versions =
			productStatesContext.versionsByPlanId[planParams.plan_id] ?? [];
		if (versions.length === 0) return [];

		return [{ planId: planParams.plan_id, toId: planParams.new_plan_id }];
	});
