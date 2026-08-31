import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { reverseLinksOnChildPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computePlanLicensesPlan/licensePlanUtils";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/**
 * propagate.license_parents must name plans that offer this child — links are
 * version-anchored, so a link on ANY child version row qualifies the parent.
 */
export const handleLicenseParentPropagationErrors = ({
	upsert,
	productStatesContext,
}: {
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): void => {
	const targets = upsert.propagate?.license_parents ?? [];
	if (targets.length === 0) return;

	const parentIds = new Set(
		reverseLinksOnChildPlan({
			planId: upsert.row.planId,
			productStatesContext,
		}).map((link) => link.product.id),
	);

	for (const target of targets) {
		if (parentIds.has(target.plan_id)) continue;
		throw new RecaseError({
			message: `Invalid propagation target: ${target.plan_id}`,
			code: ErrCode.InvalidPropagationTarget,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
