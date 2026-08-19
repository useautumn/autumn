import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/** propagate.license_parents must name plans that already offer this child. */
export const handleLicenseParentPropagationErrors = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): void => {
	const targets = upsert.propagate?.license_parents ?? [];
	if (targets.length === 0) return;

	const parentProduct =
		upsert.row.currentFullProduct ?? upsert.row.baseFullProduct;
	const parentIds = new Set(
		(parentProduct?.parent_plan_licenses ?? []).map((link) => link.product.id),
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
