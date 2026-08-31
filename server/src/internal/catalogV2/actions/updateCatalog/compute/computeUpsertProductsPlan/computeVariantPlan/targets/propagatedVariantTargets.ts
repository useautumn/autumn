import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { variantRowForPropagateTarget } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/variantRowForPropagateTarget";
import { reachInternalIdsForBaseUpsert } from "../variantPlanUtils";
import type { VariantEditTarget } from "./variantEditTarget";

/**
 * propagate.variants → follow targets. Each target resolves to a row anchored
 * to the source upsert; off-anchor pins are rejected by guards.
 */
export const propagatedVariantTargets = ({
	upsert,
	productStatesContext,
}: {
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): VariantEditTarget[] => {
	const reachIds = new Set(reachInternalIdsForBaseUpsert({ upsert }));

	return (upsert.propagate?.variants ?? []).flatMap(
		(target): VariantEditTarget[] => {
			const row = variantRowForPropagateTarget({
				target,
				anchorInternalIds: reachIds,
				productStatesContext,
			});
			if (!row?.base_internal_product_id) return [];
			if (!reachIds.has(row.base_internal_product_id)) return [];
			return [
				{
					row,
					follow: true,
					...(target.new_version_slug
						? { newVersionSlug: target.new_version_slug }
						: {}),
				},
			];
		},
	);
};
