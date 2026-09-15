import { ErrCode, type FullProduct, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

/** The base plan id a row points at, `null` when standalone, `undefined` when the base left the batch. */
const basePlanIdOf = ({
	product,
	byInternalId,
}: {
	product: FullProduct;
	byInternalId: Map<string, FullProduct>;
}): string | null | undefined => {
	if (!product.base_internal_product_id) return null;
	return byInternalId.get(product.base_internal_product_id)?.id;
};

/**
 * A variant plan is one family: every version points at the same base plan,
 * or none does. Checked on the projection so nesting, top-level
 * `base_variant_id`, unlink and rename all answer to one rule.
 */
export const handleVariantFamilyErrors = ({
	updateCatalogPlan,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
}): void => {
	const { products } = updateCatalogPlan.projected;
	const byInternalId = new Map(
		products.map((product) => [product.internal_id, product]),
	);
	const basePlanIdsByPlanId = new Map<string, Set<string | null>>();

	for (const product of products) {
		if (product.archived) continue;
		const basePlanId = basePlanIdOf({ product, byInternalId });
		// A removed base is handleRemovePlanVariantErrors' finding, not a split.
		if (basePlanId === undefined) continue;
		const basePlanIds = basePlanIdsByPlanId.get(product.id) ?? new Set();
		basePlanIds.add(basePlanId);
		basePlanIdsByPlanId.set(product.id, basePlanIds);
	}

	for (const [planId, basePlanIds] of basePlanIdsByPlanId) {
		if (basePlanIds.size <= 1) continue;
		throw new RecaseError({
			message: `All versions of ${planId} must share one base plan or all be standalone`,
			code: ErrCode.VariantCrossPlanAnchor,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
