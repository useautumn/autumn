import type { CatalogPropagateTargetParams, FullProduct } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { anchoredVariantRow } from "./anchoredVariantRow";
import { fullProductForPlanParams } from "./fullProductForPlanParams";

export const propagateTargetIsPinned = ({
	target,
}: {
	target: CatalogPropagateTargetParams;
}): boolean =>
	target.version !== undefined || target.version_slug !== undefined;

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
