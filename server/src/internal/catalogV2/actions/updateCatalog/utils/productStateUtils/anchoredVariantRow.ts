import type { CatalogVariantParams, FullProduct } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { activeFullProductForPlan } from "./activeFullProductForPlan";
import { findFullProductByInternalId } from "./findFullProductByInternalId";
import { fullProductForPlanParams } from "./fullProductForPlanParams";

/** Row of `planId` pointing at one of these base rows: active first, else latest. */
export const anchoredVariantRow = ({
	planId,
	anchorInternalIds,
	productStatesContext,
	includeArchived = false,
}: {
	planId: string;
	anchorInternalIds: Set<string>;
	productStatesContext: ProductStatesContext;
	includeArchived?: boolean;
}): FullProduct | null => {
	const anchoredRows = (
		productStatesContext.versionsByPlanId[planId] ?? []
	).filter(
		(product) =>
			(includeArchived || !product.archived) &&
			product.base_internal_product_id != null &&
			anchorInternalIds.has(product.base_internal_product_id),
	);
	if (anchoredRows.length === 0) return null;

	return (
		anchoredRows.find((product) => product.active) ??
		anchoredRows.reduce((latest, product) =>
			product.version > latest.version ? product : latest,
		)
	);
};

/** A plan with rows and no base at all: a first link claims it as a whole. */
const planIsStandalone = ({
	planId,
	productStatesContext,
}: {
	planId: string;
	productStatesContext: ProductStatesContext;
}): boolean => {
	const rows = productStatesContext.versionsByPlanId[planId] ?? [];
	return (
		rows.length > 0 && rows.every((row) => row.base_internal_product_id == null)
	);
};

/**
 * A stated stable id → that exact row. Pinned → that row. Unpinned → the row
 * anchored to the declaring base (archived included, so a restore or a refused
 * customize still finds it), or a standalone plan's active row (first link);
 * null means the entry mints.
 */
export const variantRowForDeclaredEntry = ({
	variant,
	anchorInternalIds,
	productStatesContext,
}: {
	variant: Pick<
		CatalogVariantParams,
		"variant_plan_id" | "version" | "version_slug"
	> & { internal_id?: string };
	anchorInternalIds: Set<string>;
	productStatesContext: ProductStatesContext;
}): FullProduct | null => {
	const planId = variant.variant_plan_id;
	// An id nothing owns is a guess the config made; the entry then falls back
	// to its plan id like any other.
	if (variant.internal_id !== undefined) {
		const identified = findFullProductByInternalId({
			internalId: variant.internal_id,
			productStatesContext,
		});
		if (identified) return identified;
	}
	if (variant.version !== undefined || variant.version_slug !== undefined) {
		return fullProductForPlanParams({
			planParams: {
				plan_id: planId,
				version: variant.version,
				version_slug: variant.version_slug,
			},
			productStatesContext,
		});
	}
	const anchored = anchoredVariantRow({
		planId,
		anchorInternalIds,
		productStatesContext,
		includeArchived: true,
	});
	if (anchored) return anchored;
	if (planIsStandalone({ planId, productStatesContext })) {
		return activeFullProductForPlan({ planId, productStatesContext });
	}
	return null;
};
