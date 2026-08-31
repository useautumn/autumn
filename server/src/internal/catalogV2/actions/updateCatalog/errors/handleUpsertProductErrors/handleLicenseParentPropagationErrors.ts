import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { fullProductForPlanParams } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/fullProductForPlanParams";
import { rowHasVersionableCustomers } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/rowHasVersionableCustomers";

/**
 * propagate.license_parents pins must name an existing parent row whose
 * license link points at an edited row of this child plan.
 */
export const handleLicenseParentPropagationErrors = ({
	upsert,
	productStatesContext,
	editedSourceInternalIds,
}: {
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
	editedSourceInternalIds: Set<string>;
}): void => {
	const targets = upsert.propagate?.license_parents ?? [];
	if (targets.length === 0) return;

	for (const target of targets) {
		if (target.version === undefined && target.version_slug === undefined) {
			throw new RecaseError({
				message:
					"Propagate targets must pin a row: provide version or version_slug.",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
		const pinnedRow = fullProductForPlanParams({
			planParams: target,
			productStatesContext,
		});
		if (!pinnedRow) {
			throw new RecaseError({
				message: `Invalid propagation target: ${target.plan_id}`,
				code: ErrCode.InvalidPropagationTarget,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		const anchoredLink = (pinnedRow.licenses ?? []).find(
			(link) =>
				link.product.id === upsert.row.planId &&
				editedSourceInternalIds.has(link.license_internal_product_id),
		);
		if (!anchoredLink) {
			throw new RecaseError({
				message: `Propagation target ${target.plan_id}@v${pinnedRow.version} is not linked to an edited row of ${upsert.row.planId}`,
				code: ErrCode.InvalidPropagationTarget,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		if (
			upsert.row.versioning === "new_version" &&
			!pinnedRow.active &&
			rowHasVersionableCustomers({ row: pinnedRow, productStatesContext })
		) {
			throw new RecaseError({
				message: `Cannot propagate a new version onto ${target.plan_id}@v${pinnedRow.version}: historical version has customers`,
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
	}
};
