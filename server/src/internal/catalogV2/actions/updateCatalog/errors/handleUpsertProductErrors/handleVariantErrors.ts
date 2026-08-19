import { ErrCode, findDuplicate, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

const baseInternalIdsForPlan = ({
	upsert,
	productStatesContext,
}: {
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): Set<string> =>
	new Set([
		upsert.row.nextFullProduct.internal_id,
		...(productStatesContext.versionsByPlanId[upsert.row.planId] ?? []).map(
			(product) => product.internal_id,
		),
	]);

const isVariantOfBase = ({
	variantPlanId,
	baseInternalIds,
	productStatesContext,
}: {
	variantPlanId: string;
	baseInternalIds: Set<string>;
	productStatesContext: ProductStatesContext;
}): boolean =>
	(productStatesContext.versionsByPlanId[variantPlanId] ?? []).some(
		(product) =>
			product.base_internal_product_id != null &&
			baseInternalIds.has(product.base_internal_product_id),
	);

const rejectInvalidPropagationTarget = ({
	planId,
}: {
	planId: string;
}): never => {
	throw new RecaseError({
		message: `Invalid propagation target: ${planId}`,
		code: ErrCode.InvalidPropagationTarget,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};

/** Declared variants[] + propagate.variants target guards. */
export const handleVariantErrors = ({
	upsert,
	productStatesContext,
	directPlanIds,
}: {
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
	directPlanIds: Set<string>;
}): void => {
	const declaredVariants = upsert.declaredVariants ?? [];
	const propagateTargets = upsert.propagate?.variants ?? [];
	if (declaredVariants.length === 0 && propagateTargets.length === 0) return;

	if (
		declaredVariants.length > 0 &&
		upsert.row.nextFullProduct.base_internal_product_id
	) {
		throw new RecaseError({
			message: "Cannot create a variant from another variant.",
			code: ErrCode.NestedVariantNotAllowed,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	const duplicate = findDuplicate(
		declaredVariants.map((variant) => variant.variant_plan_id),
	);
	if (duplicate) {
		throw new RecaseError({
			message: `Duplicate variant_plan_id ${duplicate} in variants`,
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	const baseInternalIds = baseInternalIdsForPlan({
		upsert,
		productStatesContext,
	});

	for (const variant of declaredVariants) {
		if (variant.variant_plan_id === upsert.row.planId) {
			throw new RecaseError({
				message: `Plan ${upsert.row.planId} cannot be its own variant.`,
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		if (directPlanIds.has(variant.variant_plan_id)) {
			throw new RecaseError({
				message: `Plan ${variant.variant_plan_id} cannot appear both as a top-level plan and in variants[]`,
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		const existing =
			productStatesContext.versionsByPlanId[variant.variant_plan_id];
		if (existing?.length) {
			if (
				!isVariantOfBase({
					variantPlanId: variant.variant_plan_id,
					baseInternalIds,
					productStatesContext,
				})
			) {
				throw new RecaseError({
					message: `Product ${variant.variant_plan_id} already exists.`,
					code: ErrCode.ProductIdAlreadyExists,
					statusCode: StatusCodes.BAD_REQUEST,
				});
			}
			continue;
		}

		if (!variant.name) {
			throw new RecaseError({
				message: `name is required when creating plan_id=${variant.variant_plan_id}`,
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
	}

	for (const target of propagateTargets) {
		if (target.plan_id === upsert.row.planId) {
			rejectInvalidPropagationTarget({ planId: target.plan_id });
		}
		const existing = productStatesContext.versionsByPlanId[target.plan_id];
		if (!existing?.length) {
			rejectInvalidPropagationTarget({ planId: target.plan_id });
		}
		if (
			!isVariantOfBase({
				variantPlanId: target.plan_id,
				baseInternalIds,
				productStatesContext,
			})
		) {
			rejectInvalidPropagationTarget({ planId: target.plan_id });
		}
	}
};
