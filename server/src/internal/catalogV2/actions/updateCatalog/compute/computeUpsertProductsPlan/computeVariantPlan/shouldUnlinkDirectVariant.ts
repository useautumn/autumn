import type { FullProduct, UpdateCatalogParams } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductSource } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { activeFullProductForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/activeFullProductForPlan";
import { findFullProductByInternalId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/findFullProductByInternalId";

/** Bases that declared `variants[]` this call → the ids they kept. */
export const indexDeclaredVariantPlanIds = ({
	plans,
}: {
	plans: UpdateCatalogParams["plans"];
}): Map<string, Set<string>> => {
	const byBase = new Map<string, Set<string>>();
	for (const entry of plans) {
		if (entry.variants === undefined) continue;
		const kept = byBase.get(entry.plan_id) ?? new Set();
		for (const variant of entry.variants) {
			if (variant.base_variant_id === null) continue;
			if (variant.variant_plan_id === entry.plan_id) continue;
			kept.add(variant.variant_plan_id);
		}
		byBase.set(entry.plan_id, kept);
	}
	return byBase;
};

/** Direct variant whose current parent declared `variants[]` without this plan. */
export const shouldUnlinkDirectVariant = ({
	source,
	planId,
	currentFullProduct,
	productStatesContext,
	declaredVariantPlanIdsByBasePlanId,
}: {
	source: UpsertProductSource;
	planId: string;
	currentFullProduct: FullProduct | null;
	productStatesContext: ProductStatesContext;
	declaredVariantPlanIdsByBasePlanId?: Map<string, Set<string>>;
}): boolean => {
	if (source !== "direct") return false;
	if (!currentFullProduct?.base_internal_product_id) return false;
	if (!declaredVariantPlanIdsByBasePlanId) return false;

	const parent = findFullProductByInternalId({
		internalId: currentFullProduct.base_internal_product_id,
		productStatesContext,
	});
	if (!parent) return false;

	const kept = declaredVariantPlanIdsByBasePlanId.get(parent.id);
	if (kept === undefined) return false;
	return !kept.has(planId);
};

/** The base that listed this plan in variants[] this call, if any. */
export const declaredParentInternalIdForPlan = ({
	planId,
	declaredVariantPlanIdsByBasePlanId,
	productStatesContext,
}: {
	planId: string;
	declaredVariantPlanIdsByBasePlanId?: Map<string, Set<string>>;
	productStatesContext: ProductStatesContext;
}): string | undefined => {
	if (!declaredVariantPlanIdsByBasePlanId) return undefined;
	for (const [basePlanId, kept] of declaredVariantPlanIdsByBasePlanId) {
		if (!kept.has(planId)) continue;
		const parent = activeFullProductForPlan({
			planId: basePlanId,
			productStatesContext,
		});
		if (parent) return parent.internal_id;
	}
	return undefined;
};
