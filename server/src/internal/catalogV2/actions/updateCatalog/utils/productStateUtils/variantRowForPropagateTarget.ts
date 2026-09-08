import type { CatalogPropagateTargetParams, FullProduct } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { anchoredVariantRow } from "./anchoredVariantRow";
import { fullProductForPlanParams } from "./fullProductForPlanParams";

/** True when the target names a specific row rather than the whole plan. */
export const propagateTargetIsPinned = ({
	target,
}: {
	target: CatalogPropagateTargetParams;
}): boolean =>
	target.version !== undefined || target.version_slug !== undefined;

/**
 * The variant row a propagate target addresses. Pinned → that exact row.
 * Plan-level → active row anchored to the edited base, else latest anchored.
 */
export const variantRowForPropagateTarget = ({
	target,
	anchorInternalIds,
	productStatesContext,
}: {
	target: CatalogPropagateTargetParams;
	anchorInternalIds: Set<string>;
	productStatesContext: ProductStatesContext;
}): FullProduct | null => {
	if (propagateTargetIsPinned({ target })) {
		return fullProductForPlanParams({
			planParams: target,
			productStatesContext,
		});
	}

	return anchoredVariantRow({
		planId: target.plan_id,
		anchorInternalIds,
		productStatesContext,
	});
};
