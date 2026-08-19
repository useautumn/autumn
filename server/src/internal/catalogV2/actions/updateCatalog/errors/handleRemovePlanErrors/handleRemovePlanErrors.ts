import { ErrCode, ProductNotFoundError, RecaseError } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { handleRemovePlanVariantErrors } from "./handleRemovePlanVariantErrors";
import { handleRemovePlanVersionErrors } from "./handleRemovePlanVersionErrors";

/** Throws when a removal is unknown, or contradicted by the same request. */
export const handleRemovePlanErrors = ({
	updateCatalogPlan,
	productStatesContext,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
	productStatesContext: ProductStatesContext;
}): void => {
	const upsertedPlanIds = new Set(
		updateCatalogPlan.upsertProducts.map((upsert) => upsert.row.planId),
	);

	for (const removePlan of updateCatalogPlan.removePlans) {
		if (!removePlan.current) {
			throw new ProductNotFoundError({
				productId: removePlan.planId,
				version: removePlan.allVersions ? undefined : removePlan.version,
			});
		}
		if (upsertedPlanIds.has(removePlan.planId)) {
			throw new RecaseError({
				message: `Cannot update and remove plan ${removePlan.planId} in the same call`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}

	handleRemovePlanVersionErrors({ updateCatalogPlan, productStatesContext });
	handleRemovePlanVariantErrors({ updateCatalogPlan });
};
