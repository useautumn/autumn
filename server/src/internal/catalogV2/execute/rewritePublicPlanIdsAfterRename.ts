import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { rewritePlanIdAliasValues } from "@/internal/catalogV2/productAliases/rewritePlanIdAliasValues";

/** After identity moves, remaining execute consumers must see toId. */
export const rewritePublicPlanIdsAfterRename = ({
	updateCatalogPlan,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
}): void => {
	if (updateCatalogPlan.renamePlans.length === 0) return;

	const fromTo = Object.fromEntries(
		updateCatalogPlan.renamePlans.map(({ planId, toId }) => [planId, toId]),
	);

	for (const upsert of updateCatalogPlan.upsertProducts) {
		upsert.row.planId = fromTo[upsert.row.planId] ?? upsert.row.planId;
	}

	rewritePlanIdAliasValues({
		value: updateCatalogPlan.migrationDrafts,
		aliases: fromTo,
	});
};
