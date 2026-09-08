import type { CatalogVariantParams } from "@autumn/shared";
import { variantCreateTarget } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeVariantPlan/creates/variantCreateTarget";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { variantPinKey } from "./variantEntryMintsRow";

/**
 * Every identity the row a variants[] entry mints answers to: the version it
 * takes, the slug it will carry, and the unpinned form. A propagate target in
 * the same push may name it by any of them.
 */
const pinsForMintedVariant = ({
	variant,
	productStatesContext,
}: {
	variant: CatalogVariantParams;
	productStatesContext: ProductStatesContext;
}): string[] => {
	const target = variantCreateTarget({ variant, productStatesContext });
	if (!target) return [];

	const planId = variant.variant_plan_id;
	return [
		variantPinKey({ planId }),
		variantPinKey({ planId, version: target.version }),
		variantPinKey({
			planId,
			versionSlug: target.newVersionSlug ?? `v${target.version}`,
		}),
	];
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
		variants.flatMap((variant) =>
			pinsForMintedVariant({ variant, productStatesContext }),
		),
	);
