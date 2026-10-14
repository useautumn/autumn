import { ErrCode, ProductNotFoundError, RecaseError } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { handlePartialPlanArchiveErrors } from "./handlePartialPlanArchiveErrors";
import { handleRemovePlanVariantErrors } from "./handleRemovePlanVariantErrors";

export const handleRemovePlanErrors = ({
	updateCatalogPlan,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
	productStatesContext: ProductStatesContext;
}): void => {
	const contradicting = updateCatalogPlan.upsertProducts.filter(
		(upsert) => upsert.row.source !== "demoted_product",
	);
	const upsertedPlanIds = new Set(
		contradicting.map((upsert) => upsert.row.planId),
	);
	const upsertedVersions = new Set(
		contradicting.map((upsert) => `${upsert.row.planId}@${upsert.row.version}`),
	);

	for (const removePlan of updateCatalogPlan.removePlans) {
		if (!removePlan.current) {
			throw new ProductNotFoundError({
				productId: removePlan.planId,
				version: removePlan.allVersions ? undefined : removePlan.version,
			});
		}
		const collides = removePlan.allVersions
			? upsertedPlanIds.has(removePlan.planId)
			: upsertedVersions.has(`${removePlan.planId}@${removePlan.version}`);
		if (collides) {
			throw new RecaseError({
				message: `Cannot update and remove plan ${removePlan.planId} in the same call`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}

	handlePartialPlanArchiveErrors({ updateCatalogPlan });
	handleRemovePlanVariantErrors({ updateCatalogPlan });
};
