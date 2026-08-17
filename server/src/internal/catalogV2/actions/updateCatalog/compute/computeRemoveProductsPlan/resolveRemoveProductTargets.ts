import type { UpdateCatalogParams } from "@autumn/shared";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { RemovePlanPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

export type RemovePlanTarget = Omit<
	RemovePlanPlan,
	"willArchive" | "hasCustomers"
>;

/** Expand each remove_plans entry to one target per version (or the pinned row). */
export const resolveRemoveProductTargets = ({
	params,
	catalogContext,
}: {
	params: UpdateCatalogParams;
	catalogContext: UpdateCatalogContext;
}): RemovePlanTarget[] =>
	params.remove_plans.flatMap((entry): RemovePlanTarget[] => {
		const versions =
			catalogContext.productStatesContext.versionsByPlanId[entry.plan_id] ??
			[];
		if (entry.version !== undefined) {
			const current =
				versions.find((product) => product.version === entry.version) ??
				null;
			return [
				{
					planId: entry.plan_id,
					version: entry.version,
					current,
					allVersions: false,
				},
			];
		}
		if (versions.length === 0) {
			return [
				{
					planId: entry.plan_id,
					version: 1,
					current: null,
					allVersions: true,
				},
			];
		}
		return versions.map((product) => ({
			planId: entry.plan_id,
			version: product.version,
			current: product,
			allVersions: true,
		}));
	});
