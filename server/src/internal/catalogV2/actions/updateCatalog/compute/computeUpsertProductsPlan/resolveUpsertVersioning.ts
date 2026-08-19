import type {
	CatalogPlanVersioningStrategy,
	UpdateCatalogPlanParams,
} from "@autumn/shared";
import type { UpsertProductSource } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/** Sibling expansion always resolves to all_versions; otherwise params (default existing). */
export const resolveUpsertVersioning = ({
	planParams,
	source,
}: {
	planParams: UpdateCatalogPlanParams;
	source: UpsertProductSource;
}): CatalogPlanVersioningStrategy => {
	if (source === "all_versions") return "all_versions";
	return planParams.versioning ?? "existing";
};
