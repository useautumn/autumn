import { ErrCode, RecaseError, type UpdateCatalogParams } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";

const rejectNesting = ({ message }: { message: string }): never => {
	throw new RecaseError({
		message,
		code: ErrCode.NestedVariantNotAllowed,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};

const planHasVariants = ({
	planId,
	productStatesContext,
}: {
	planId: string;
	productStatesContext: ProductStatesContext;
}): boolean => {
	const internalIds = new Set(
		(productStatesContext.versionsByPlanId[planId] ?? []).map(
			(product) => product.internal_id,
		),
	);
	if (internalIds.size === 0) return false;

	return Object.values(productStatesContext.versionsByPlanId).some((versions) =>
		versions.some(
			(product) =>
				product.id !== planId &&
				product.base_internal_product_id != null &&
				internalIds.has(product.base_internal_product_id),
		),
	);
};

/** Declared `base_plan_id` guards — the base must exist, and neither side may already be linked. */
export const handleUpsertProductBasePlanErrors = ({
	params,
	productStatesContext,
}: {
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
}): void => {
	for (const planParams of params.plans) {
		const basePlanId = planParams.base_plan_id;
		if (basePlanId == null) continue;

		const { plan_id: planId } = planParams;
		if (basePlanId === planId) {
			throw new RecaseError({
				message: `Plan ${planId} cannot be its own base plan.`,
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		const baseVersions =
			productStatesContext.versionsByPlanId[basePlanId] ?? [];
		const latestBase = baseVersions[0];
		if (!latestBase) {
			throw new RecaseError({
				message: `Base plan ${basePlanId} not found. Create it before linking ${planId} to it.`,
				code: ErrCode.ProductNotFound,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		if (latestBase.base_internal_product_id != null) {
			rejectNesting({
				message: `Plan ${basePlanId} is already a variant and cannot be used as a base plan.`,
			});
		}

		if (planHasVariants({ planId, productStatesContext })) {
			rejectNesting({
				message: `Plan ${planId} already has variants and cannot become one.`,
			});
		}
	}
};
