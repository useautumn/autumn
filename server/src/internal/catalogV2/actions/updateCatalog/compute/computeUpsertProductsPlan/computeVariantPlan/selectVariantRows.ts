import type { FullProduct } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { variantRowForDeclaredEntry } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/anchoredVariantRow";

export const selectVariantRows = ({
	planId,
	internalId,
	version,
	versionSlug,
	allVersions = false,
	anchorInternalIds,
	productStatesContext,
}: {
	planId: string;
	internalId?: string;
	version?: number;
	versionSlug?: string;
	allVersions?: boolean;
	anchorInternalIds: Set<string>;
	productStatesContext: ProductStatesContext;
}): FullProduct[] => {
	const pinned =
		internalId !== undefined ||
		version !== undefined ||
		versionSlug !== undefined;
	if (allVersions && !pinned) {
		return (productStatesContext.versionsByPlanId[planId] ?? []).filter(
			(product) => !product.archived,
		);
	}

	const row = variantRowForDeclaredEntry({
		variant: {
			variant_plan_id: planId,
			internal_id: internalId,
			version,
			version_slug: versionSlug,
		},
		anchorInternalIds,
		productStatesContext,
	});
	return row ? [row] : [];
};
