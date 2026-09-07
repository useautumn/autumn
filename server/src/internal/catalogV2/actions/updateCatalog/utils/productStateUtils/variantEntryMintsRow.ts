import type { CatalogVariantParams } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { fullProductForPlanParams } from "./fullProductForPlanParams";
import { maxVersionForPlan } from "./maxVersionForPlan";

/** How a variants[] entry or a propagate target names one row of a variant plan. */
export const variantPinKey = ({
	planId,
	version,
	versionSlug,
}: {
	planId: string;
	version?: number;
	versionSlug?: string;
}): string =>
	`${planId}@${version !== undefined ? `#${version}` : (versionSlug ?? "latest")}`;

/**
 * A variants[] entry naming a row of its plan that does not exist yet. The
 * config is the desired state, so this push writes that row rather than 400ing.
 */
export const variantEntryMintsRow = ({
	variant,
	productStatesContext,
}: {
	variant: CatalogVariantParams;
	productStatesContext: ProductStatesContext;
}): boolean => {
	if (variant.base_variant_id === null) return false;
	if (variant.version === undefined && variant.version_slug === undefined) {
		return (
			maxVersionForPlan({
				planId: variant.variant_plan_id,
				productStatesContext,
			}) === 0
		);
	}

	return (
		fullProductForPlanParams({
			planParams: {
				plan_id: variant.variant_plan_id,
				version: variant.version,
				version_slug: variant.version_slug,
			},
			productStatesContext,
		}) === null
	);
};

/** Pins these variants[] entries mint, keyed for a propagate target lookup. */
export const mintedVariantPins = ({
	variants,
	productStatesContext,
}: {
	variants: CatalogVariantParams[];
	productStatesContext: ProductStatesContext;
}): Set<string> =>
	new Set(
		variants
			.filter((variant) =>
				variantEntryMintsRow({ variant, productStatesContext }),
			)
			.map((variant) =>
				variantPinKey({
					planId: variant.variant_plan_id,
					version: variant.version,
					versionSlug: variant.version_slug,
				}),
			),
	);
