import type { CatalogPlanVersioning, FullProduct } from "@autumn/shared";
import { computeVersioningOptions } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/versioningOptions/computeVersioningOptions";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/** Pickable strategies for this update row. */
export const buildPlanVersioning = ({
	upsert,
	versionsForPlan,
	productStatesContext,
}: {
	upsert: UpsertProductPlan;
	versionsForPlan: FullProduct[];
	productStatesContext: ProductStatesContext;
}): CatalogPlanVersioning | null => {
	const isNewVersionMint =
		upsert.row.op === "create" && upsert.row.versioning === "new_version";

	if (upsert.row.op !== "update" && !isNewVersionMint) return null;

	const options = computeVersioningOptions({
		upsert,
		versionsForPlan,
		productStatesContext,
	});

	if (isNewVersionMint) {
		const baseVersion =
			upsert.row.baseFullProduct?.version ?? upsert.row.version - 1;
		return {
			current_version: baseVersion,
			new_version: upsert.row.version,
			resolved: "new_version",
			options,
		};
	}

	return {
		current_version: upsert.row.version,
		new_version: null,
		resolved: upsert.row.versioning,
		options,
	};
};
