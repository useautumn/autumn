import type { CatalogAction } from "@autumn/shared";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/**
 * Plan-level, not row-level: `create` means the plan_id had no live version.
 * Minting a version of a live plan is an `update`, even though it inserts a row.
 */
export const upsertToCatalogAction = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): CatalogAction => {
	if (upsert.row.op === "none") return "none";
	return upsert.state.planHadLiveVersions ? "update" : "create";
};
