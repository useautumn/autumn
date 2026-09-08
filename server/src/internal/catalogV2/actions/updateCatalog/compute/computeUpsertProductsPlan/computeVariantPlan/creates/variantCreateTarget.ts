import type { CatalogVariantParams, FullProduct } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { maxVersionForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/maxVersionForPlan";
import { variantEntryMintsRow } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/variantEntryMintsRow";

/** The row a variants[] entry asks this push to write, and what it inherits. */
export type VariantCreateTarget = {
	version: number;
	/** Highest-numbered row of the variant plan; null when the plan is new here. */
	previous: FullProduct | null;
	newVersionSlug?: string;
};

// By version, not by `active`: a minted row succeeds the tip of the plan, and
// the tip can be an inactive row the pointer has not moved to yet.
const latestRowForPlan = ({
	planId,
	productStatesContext,
}: {
	planId: string;
	productStatesContext: ProductStatesContext;
}): FullProduct | null =>
	(
		productStatesContext.versionsByPlanId[planId] ?? []
	).reduce<FullProduct | null>(
		(latest, product) =>
			latest && latest.version > product.version ? latest : product,
		null,
	);

/**
 * A variant plan with no rows takes v1; one whose stated pin names no row takes
 * max+1 under that name, the same rule a top-level `version_slug` follows.
 */
export const variantCreateTarget = ({
	variant,
	productStatesContext,
}: {
	variant: CatalogVariantParams;
	productStatesContext: ProductStatesContext;
}): VariantCreateTarget | null => {
	if (!variantEntryMintsRow({ variant, productStatesContext })) return null;

	const newVersionSlug = variant.new_version_slug ?? variant.version_slug;
	const maxVersion = maxVersionForPlan({
		planId: variant.variant_plan_id,
		productStatesContext,
	});
	// A brand-new variant plan has no name to inherit; a nameless entry is a 400
	// from handleVariantErrors, and the create path falls back to the plan id.
	if (maxVersion === 0) {
		return {
			version: 1,
			previous: null,
			...(newVersionSlug ? { newVersionSlug } : {}),
		};
	}

	return {
		version: maxVersion + 1,
		previous: latestRowForPlan({
			planId: variant.variant_plan_id,
			productStatesContext,
		}),
		...(newVersionSlug ? { newVersionSlug } : {}),
	};
};
