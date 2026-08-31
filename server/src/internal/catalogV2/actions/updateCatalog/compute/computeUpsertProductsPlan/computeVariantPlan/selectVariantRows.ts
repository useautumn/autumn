import type { FullProduct } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { fullProductForPlanParams } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/fullProductForPlanParams";

/**
 * THE variant row selector, shared by variants[] and propagate.variants:
 * pin `version` / `version_slug` → that row; omit → active; allVersions → every live row.
 */
export const selectVariantRows = ({
	planId,
	version,
	versionSlug,
	allVersions = false,
	productStatesContext,
}: {
	planId: string;
	version?: number;
	versionSlug?: string;
	allVersions?: boolean;
	productStatesContext: ProductStatesContext;
}): FullProduct[] => {
	const pinned = version !== undefined || versionSlug !== undefined;
	if (allVersions && !pinned) {
		return (productStatesContext.versionsByPlanId[planId] ?? []).filter(
			(product) => !product.archived,
		);
	}

	const row = fullProductForPlanParams({
		planParams: { plan_id: planId, version, version_slug: versionSlug },
		productStatesContext,
	});
	return row ? [row] : [];
};
