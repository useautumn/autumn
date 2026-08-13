import type {
	CatalogPlanVersioning,
	CatalogPlanVersioningStrategy,
	FullProduct,
} from "@autumn/shared";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/** Pickable strategies for this update row. */
export const buildPlanVersioning = ({
	upsert,
	versionsForPlan,
}: {
	upsert: UpsertProductPlan;
	versionsForPlan: FullProduct[];
}): CatalogPlanVersioning | null => {
	const isNewVersionMint =
		upsert.row.op === "create" && upsert.row.versioning === "new_version";

	if (upsert.row.op !== "update" && !isNewVersionMint) return null;

	const options: CatalogPlanVersioningStrategy[] = [];
	if (upsert.state.hasCustomers) options.push("existing");

	// Mint only from latest (or when this row is the resolved mint).
	const latestVersion = versionsForPlan[0]?.version;
	const isLatestUpdate =
		latestVersion !== undefined && latestVersion === upsert.row.version;
	if (
		upsert.state.hasCustomers &&
		(isNewVersionMint || isLatestUpdate)
	) {
		options.push("new_version");
	}
	if (versionsForPlan.length > 1) options.push("all_versions");

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
