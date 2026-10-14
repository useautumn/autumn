import type { CatalogVariantParams } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { variantRowForDeclaredEntry } from "./anchoredVariantRow";

export const variantPinKey = ({
	planId,
	version,
	versionSlug,
}: {
	planId: string;
	version?: number;
	versionSlug?: string;
}): string => {
	if (version !== undefined) return `${planId}@#${version}`;
	if (versionSlug !== undefined) return `${planId}@~${versionSlug}`;
	return `${planId}@*`;
};

export const variantEntryMintsRow = ({
	variant,
	anchorInternalIds,
	productStatesContext,
}: {
	variant: CatalogVariantParams;
	anchorInternalIds: Set<string>;
	productStatesContext: ProductStatesContext;
}): boolean => {
	if (variant.base_variant_id === null) return false;
	if (variant.version !== undefined) return false;
	return (
		variantRowForDeclaredEntry({
			variant,
			anchorInternalIds,
			productStatesContext,
		}) === null
	);
};
