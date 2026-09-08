import type { CatalogVariantParams } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { variantRowForDeclaredEntry } from "./anchoredVariantRow";

/**
 * How a variants[] entry or a propagate target names one row of a variant plan.
 * The three pin kinds stay distinct: an omitted pin is not the slug "latest".
 */
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

/**
 * A variants[] entry naming a row that does not exist yet (unknown slug, or
 * unpinned under a base nothing points at) mints it; a numeric pin never does.
 */
export const variantEntryMintsRow = ({
	variant,
	anchorInternalIds,
	productStatesContext,
}: {
	variant: CatalogVariantParams;
	/** Base rows the entry sits under: the row being written and what it replaces. */
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
