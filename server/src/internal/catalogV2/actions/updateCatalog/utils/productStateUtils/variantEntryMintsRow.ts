import type { CatalogVariantParams } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { fullProductForSlug } from "./fullProductForSlug";
import { maxVersionForPlan } from "./maxVersionForPlan";

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
 * A variants[] entry naming a row of its plan that does not exist yet. The
 * config is the desired state, so this push writes that row rather than 400ing.
 * A numeric `version` only addresses — naming no row is refused, never minted.
 */
export const variantEntryMintsRow = ({
	variant,
	productStatesContext,
}: {
	variant: CatalogVariantParams;
	productStatesContext: ProductStatesContext;
}): boolean => {
	if (variant.base_variant_id === null) return false;
	if (variant.version !== undefined) return false;
	if (variant.version_slug === undefined) {
		return (
			maxVersionForPlan({
				planId: variant.variant_plan_id,
				productStatesContext,
			}) === 0
		);
	}

	return (
		fullProductForSlug({
			planId: variant.variant_plan_id,
			versionSlug: variant.version_slug,
			productStatesContext,
		}) === null
	);
};
