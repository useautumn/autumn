import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { findFullProductByInternalId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/findFullProductByInternalId";

/** propagate.license_parents must name plans that already offer this child. */
export const handleLicenseParentPropagationErrors = ({
	upsert,
	productStatesContext,
}: {
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): void => {
	const targets = upsert.propagate?.license_parents ?? [];
	if (targets.length === 0) return;

	const previousActive = upsert.previousActiveInternalId
		? findFullProductByInternalId({
				internalId: upsert.previousActiveInternalId,
				productStatesContext,
			})
		: null;
	const parentIds = new Set(
		[
			upsert.row.currentFullProduct,
			upsert.row.baseFullProduct,
			previousActive,
		].flatMap((product) =>
			(product?.parent_plan_licenses ?? []).map((link) => link.product.id),
		),
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
