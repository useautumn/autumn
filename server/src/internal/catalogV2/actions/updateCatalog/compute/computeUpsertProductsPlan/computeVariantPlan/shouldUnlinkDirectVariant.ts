import type { FullProduct, UpdateCatalogParams } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductSource } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { findFullProductByInternalId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/findFullProductByInternalId";
import { fullProductForPlanParams } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/fullProductForPlanParams";

export type DeclaredVariantsMap = {
	/** Declaring base row → variant plan ids listed on that row's variants[]. */
	rowToVariantPlanIds: Map<string, Set<string>>;
	/** Variant plan id → declaring base row (last writer). */
	variantPlanIdToRow: Map<string, string>;
};

/** Which base row listed each variant plan in variants[] this call. */
export const indexDeclaredVariants = ({
	plans,
	productStatesContext,
}: {
	plans: UpdateCatalogParams["plans"];
	productStatesContext: ProductStatesContext;
}): DeclaredVariantsMap => {
	const rowToVariantPlanIds = new Map<string, Set<string>>();
	const variantPlanIdToRow = new Map<string, string>();

	for (const entry of plans) {
		if (entry.variants === undefined) continue;
		const parent = fullProductForPlanParams({
			planParams: entry,
			productStatesContext,
		});
		if (!parent) continue;

		const listed = rowToVariantPlanIds.get(parent.internal_id) ?? new Set();
		for (const variant of entry.variants) {
			if (variant.base_variant_id === null) continue;
			if (variant.variant_plan_id === entry.plan_id) continue;
			listed.add(variant.variant_plan_id);
			variantPlanIdToRow.set(variant.variant_plan_id, parent.internal_id);
		}
		rowToVariantPlanIds.set(parent.internal_id, listed);
	}

	return { rowToVariantPlanIds, variantPlanIdToRow };
};

/** Direct variant whose current parent row restated variants[] without this plan. */
export const shouldUnlinkDirectVariant = ({
	source,
	planId,
	currentFullProduct,
	productStatesContext,
	declaredVariants,
}: {
	source: UpsertProductSource;
	planId: string;
	currentFullProduct: FullProduct | null;
	productStatesContext: ProductStatesContext;
	declaredVariants?: DeclaredVariantsMap;
}): boolean => {
	if (source !== "direct") return false;
	if (!currentFullProduct?.base_internal_product_id) return false;
	if (!declaredVariants) return false;

	const parent = findFullProductByInternalId({
		internalId: currentFullProduct.base_internal_product_id,
		productStatesContext,
	});
	if (!parent) return false;

	const listed = declaredVariants.rowToVariantPlanIds.get(parent.internal_id);
	if (listed === undefined) return false;
	return !listed.has(planId);
};

/** The base row that listed this plan in variants[] this call, if any. */
export const declaredParentInternalIdForPlan = ({
	planId,
	declaredVariants,
}: {
	planId: string;
	declaredVariants?: DeclaredVariantsMap;
}): string | undefined =>
	declaredVariants?.variantPlanIdToRow.get(planId);
