import type { CatalogAction } from "@autumn/shared";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

export const upsertToCatalogAction = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): CatalogAction => {
	if (upsert.row.op === "none") return "none";
	return upsert.state.planHadLiveVersions ? "update" : "create";
};
