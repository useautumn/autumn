import {
	type CatalogVariantParams,
	type FullProduct,
	productKeyToString,
} from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { fullProductForSlug } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/fullProductForSlug";
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

/** An unpinned mint carries its base's slug when the variant plan has it free. */
const inheritedVersionSlug = ({
	variant,
	baseVersionSlug,
	productStatesContext,
}: {
	variant: CatalogVariantParams;
	baseVersionSlug: string | undefined;
	productStatesContext: ProductStatesContext;
}): string | undefined => {
	const stated = variant.new_version_slug ?? variant.version_slug;
	if (stated !== undefined || baseVersionSlug === undefined) return stated;
	const taken =
		fullProductForSlug({
			planId: variant.variant_plan_id,
			versionSlug: baseVersionSlug,
			productStatesContext,
		}) !== null;
	return taken ? undefined : baseVersionSlug;
};

/**
 * A variant plan with no rows takes v1; one whose stated pin names no row takes
 * max+1 under that name, the same rule a top-level `version_slug` follows.
 */
export const variantCreateTarget = ({
	variant,
	anchorInternalIds,
	baseVersionSlug,
	productStatesContext,
	claimedProductKeys,
}: {
	variant: CatalogVariantParams;
	anchorInternalIds: Set<string>;
	/** Slug of the base row the entry sits under, inherited by an unpinned mint. */
	baseVersionSlug?: string;
	productStatesContext: ProductStatesContext;
	/** Rows this push already speaks for; a pending create is not in the projection yet. */
	claimedProductKeys?: Set<string>;
}): VariantCreateTarget | null => {
	if (
		!variantEntryMintsRow({ variant, anchorInternalIds, productStatesContext })
	)
		return null;

	const newVersionSlug = inheritedVersionSlug({
		variant,
		baseVersionSlug,
		productStatesContext,
	});
	const maxVersion = maxVersionForPlan({
		planId: variant.variant_plan_id,
		productStatesContext,
	});
	// Two bases in one push each minting their own row of the same variant plan
	// must not land on one version number.
	let version = maxVersion + 1;
	while (
		claimedProductKeys?.has(
			productKeyToString({
				productKey: { planId: variant.variant_plan_id, version },
			}),
		)
	)
		version += 1;
	// A brand-new variant plan has no name to inherit; a nameless entry is a 400
	// from handleVariantErrors, and the create path falls back to the plan id.
	if (maxVersion === 0) {
		return {
			version,
			previous: null,
			...(newVersionSlug ? { newVersionSlug } : {}),
		};
	}

	return {
		version,
		previous: latestRowForPlan({
			planId: variant.variant_plan_id,
			productStatesContext,
		}),
		...(newVersionSlug ? { newVersionSlug } : {}),
	};
};
