import { ErrCode, ProductNotFoundError, RecaseError } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { handleRemovePlanVariantErrors } from "./handleRemovePlanVariantErrors";

/** Throws when a removal is unknown, or contradicted by the same request. */
export const handleRemovePlanErrors = ({
	updateCatalogPlan,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
	productStatesContext: ProductStatesContext;
}): void => {
	const upsertedPlanIds = new Set(
		updateCatalogPlan.upsertProducts.map((upsert) => upsert.row.planId),
	);
	const upsertedVersions = new Set(
		updateCatalogPlan.upsertProducts.map(
			(upsert) => `${upsert.row.planId}@${upsert.row.version}`,
		),
	);

	for (const removePlan of updateCatalogPlan.removePlans) {
		if (!removePlan.current) {
			throw new ProductNotFoundError({
				productId: removePlan.planId,
				version: removePlan.allVersions ? undefined : removePlan.version,
			});
		}
		// Removing one version beside an upsert of another is a version-level
		// full-state edit; only the same row cannot be both.
		const collides = removePlan.allVersions
			? upsertedPlanIds.has(removePlan.planId)
			: upsertedVersions.has(`${removePlan.planId}@${removePlan.version}`);
		if (collides) {
			const scope = removePlan.allVersions
				? "every version"
				: `version ${removePlan.version}`;
			throw new RecaseError({
				message: `Cannot update and remove plan ${removePlan.planId} (${scope}) in the same call`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}

	handleRemovePlanVariantErrors({ updateCatalogPlan });
};
