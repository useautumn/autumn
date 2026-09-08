import type { CatalogVariantParams, FullProduct } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { activeFullProductForPlan } from "./activeFullProductForPlan";
import { fullProductForPlanParams } from "./fullProductForPlanParams";

/** Live row of `planId` pointing at one of these base rows: active first, else latest. */
export const anchoredVariantRow = ({
	planId,
	anchorInternalIds,
	productStatesContext,
}: {
	planId: string;
	anchorInternalIds: Set<string>;
	productStatesContext: ProductStatesContext;
}): FullProduct | null => {
	const anchoredRows = (
		productStatesContext.versionsByPlanId[planId] ?? []
	).filter(
		(product) =>
			!product.archived &&
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
 * Pinned → that row. Unpinned → the row anchored to the declaring base, or a
 * standalone plan's active row (first link); null means the entry mints.
 */
export const variantRowForDeclaredEntry = ({
	variant,
	anchorInternalIds,
	productStatesContext,
}: {
	variant: Pick<
		CatalogVariantParams,
		"variant_plan_id" | "version" | "version_slug"
	>;
	anchorInternalIds: Set<string>;
	productStatesContext: ProductStatesContext;
}): FullProduct | null => {
	const planId = variant.variant_plan_id;
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
	});
	if (anchored) return anchored;
	if (planIsStandalone({ planId, productStatesContext })) {
		return activeFullProductForPlan({ planId, productStatesContext });
	}
	return null;
};
