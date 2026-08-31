import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { findFullProductByInternalId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/findFullProductByInternalId";

const baseSentVariantsArray = ({
	upsertProducts,
	basePlanId,
}: {
	upsertProducts: UpsertProductPlan[];
	basePlanId: string;
}): boolean =>
	upsertProducts.some(
		(upsert) =>
			upsert.row.source === "direct" &&
			upsert.row.planId === basePlanId &&
			upsert.declaredVariants !== undefined,
	);

/**
 * A variant and its base cannot both be top-level content edits.
 * Hierarchical membership (`base.variants[]`, including `[]` to unlink) is
 * the only legal same-call pair.
 */
export const handleDirectBaseAndVariantPairErrors = ({
	directPlanIds,
	upsertProducts,
	productStatesContext,
}: {
	directPlanIds: Set<string>;
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
}): void => {
	if (directPlanIds.size < 2) return;

	for (const planId of directPlanIds) {
		for (const row of productStatesContext.versionsByPlanId[planId] ?? []) {
			if (!row.base_internal_product_id) continue;
			const base = findFullProductByInternalId({
				internalId: row.base_internal_product_id,
				productStatesContext,
			});
			if (!base || base.id === planId || !directPlanIds.has(base.id)) continue;
			if (baseSentVariantsArray({ upsertProducts, basePlanId: base.id })) {
				continue;
			}

			throw new RecaseError({
				message: `Plan ${planId} is a variant of ${base.id}; edit it via ${base.id}.variants[], not as a sibling top-level plan`,
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
	}
};
