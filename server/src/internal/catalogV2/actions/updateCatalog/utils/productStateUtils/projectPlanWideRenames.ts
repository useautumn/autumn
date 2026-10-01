import type { FullProduct } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/** Execute renames every version of a plan; re-key the sibling rows no upsert touched. */
export const projectPlanWideRenames = ({
	productStatesContext,
	upsertProducts,
}: {
	productStatesContext: ProductStatesContext;
	upsertProducts: UpsertProductPlan[];
}): ProductStatesContext => {
	const renamedPlanIds = new Map(
		upsertProducts.flatMap((upsert) => {
			const { op, currentFullProduct, nextFullProduct } = upsert.row;
			return op !== "create" &&
				currentFullProduct &&
				currentFullProduct.id !== nextFullProduct.id
				? ([[currentFullProduct.id, nextFullProduct.id]] as const)
				: [];
		}),
	);
	if (renamedPlanIds.size === 0) return productStatesContext;

	const versionsByPlanId: Record<string, FullProduct[]> = {};
	for (const [planId, rows] of Object.entries(
		productStatesContext.versionsByPlanId,
	)) {
		const toId = renamedPlanIds.get(planId) ?? planId;
		versionsByPlanId[planId] ??= [];
		versionsByPlanId[toId] = [
			...(versionsByPlanId[toId] ?? []),
			...rows.map((row) => (toId === planId ? row : { ...row, id: toId })),
		].sort((a, b) => b.version - a.version);
	}

	return { ...productStatesContext, versionsByPlanId };
};
