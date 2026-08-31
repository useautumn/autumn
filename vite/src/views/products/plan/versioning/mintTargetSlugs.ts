import type { CatalogPropagateParams } from "@autumn/shared";
import {
	type VariantTarget,
	variantTargetMintsInSelection,
} from "../catalog/catalogPlanPreview";
import { mintVersionSlugError } from "../utils/versionSlug";

/**
 * What every row this save mints gets named. Targets reuse `base` until overridden,
 * so "same slug as the plan" needs no control of its own.
 */
export type MintSlugSelection = {
	base: string;
	overrides: Record<string, string>;
};

export const emptyMintSlugSelection = (): MintSlugSelection => ({
	base: "",
	overrides: {},
});

export const effectiveMintSlug = ({
	selection,
	planId,
}: {
	selection: MintSlugSelection;
	planId: string;
}): string => selection.overrides[planId] ?? selection.base;

export const withMintSlugOverride = ({
	selection,
	planId,
	slug,
}: {
	selection: MintSlugSelection;
	planId: string;
	slug: string;
}): MintSlugSelection => ({
	...selection,
	overrides: { ...selection.overrides, [planId]: slug },
});

/**
 * Preview slugs collapse a null slug to `v{n}`, so a match here can flag a name the
 * server would allow. Blocking is the kinder read: two rows showing `v2` is worse.
 */
export const mintTargetSlugError = ({
	slug,
	takenSlugs,
}: {
	slug: string;
	takenSlugs: string[];
}): string | null => {
	const formatError = mintVersionSlugError({ slug });
	if (formatError) return formatError;

	const trimmed = slug.trim();
	if (trimmed.length === 0) return null;
	if (!takenSlugs.includes(trimmed)) return null;
	return `Another version of this plan already uses ${trimmed}.`;
};

/**
 * Selected minting targets whose slug the save would reject. Scoped to the selection
 * so a blocked step always renders the row that blocks it.
 */
export const mintTargetSlugConflicts = ({
	targets,
	selectedKeys,
	selection,
}: {
	targets: VariantTarget[];
	selectedKeys: string[];
	selection: MintSlugSelection;
}): VariantTarget[] =>
	targets.filter(
		(target) =>
			variantTargetMintsInSelection({ target, selectedKeys }) &&
			mintTargetSlugError({
				slug: effectiveMintSlug({ selection, planId: target.planId }),
				takenSlugs: target.takenSlugs,
			}) !== null,
	);

/** Save-only: naming targets in preview would surface collisions before they're editable. */
export const propagateWithMintSlugs = ({
	propagate,
	selection,
}: {
	propagate: CatalogPropagateParams | undefined;
	selection: MintSlugSelection;
}): CatalogPropagateParams | undefined => {
	if (!propagate?.variants) return propagate;

	return {
		...propagate,
		variants: propagate.variants.map((target) => {
			const slug = effectiveMintSlug({
				selection,
				planId: target.plan_id,
			}).trim();
			return slug ? { ...target, new_version_slug: slug } : target;
		}),
	};
};
