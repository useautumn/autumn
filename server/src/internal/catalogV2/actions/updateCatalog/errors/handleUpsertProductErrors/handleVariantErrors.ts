import { ErrCode, findDuplicate, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { editedBaseInternalIds } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/editedBaseInternalIds";
import { findFullProductByInternalId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/findFullProductByInternalId";
import { maxVersionForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/maxVersionForPlan";
import { rowHasVersionableCustomers } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/rowHasVersionableCustomers";
import {
	propagateTargetIsPinned,
	variantRowForPropagateTarget,
} from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/variantRowForPropagateTarget";

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

const planHasChildVariants = ({
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
	return Object.values(productStatesContext.versionsByPlanId).some((versions) =>
		versions.some(
			(product) =>
				product.base_internal_product_id != null &&
				internalIds.has(product.base_internal_product_id),
		),
	);
};

const rejectInvalidPropagationTarget: (args: { planId: string }) => never = ({
	planId,
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
	editedSourceInternalIds,
}: {
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
	directPlanIds: Set<string>;
	editedSourceInternalIds: Set<string>;
}): void => {
	const declaredVariants = upsert.declaredVariants ?? [];
	const propagateTargets = upsert.propagate?.variants ?? [];
	if (declaredVariants.length === 0 && propagateTargets.length === 0) return;

	for (const variant of declaredVariants) {
		if (variant.variant_plan_id === upsert.row.planId) {
			throw new RecaseError({
				message: `Plan ${upsert.row.planId} cannot be its own variant.`,
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
	}

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
		const existingRows =
			productStatesContext.versionsByPlanId[variant.variant_plan_id] ?? [];
		for (const row of existingRows) {
			if (!row.base_internal_product_id) continue;
			const anchoredBase = findFullProductByInternalId({
				internalId: row.base_internal_product_id,
				productStatesContext,
			});
			if (anchoredBase && anchoredBase.id !== upsert.row.planId) {
				throw new RecaseError({
					message: `All versions of ${variant.variant_plan_id} must point at ${upsert.row.planId}`,
					code: ErrCode.VariantCrossPlanAnchor,
					statusCode: StatusCodes.BAD_REQUEST,
				});
			}
		}

		if (
			typeof variant.base_variant_id === "string" &&
			variant.base_variant_id !== upsert.row.planId
		) {
			throw new RecaseError({
				message: `variants[].base_variant_id must be ${upsert.row.planId} or null`,
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		if (
			directPlanIds.has(variant.variant_plan_id) &&
			variant.base_variant_id !== null &&
			isVariantOfBase({
				variantPlanId: variant.variant_plan_id,
				baseInternalIds,
				productStatesContext,
			})
		) {
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
				isVariantOfBase({
					variantPlanId: variant.variant_plan_id,
					baseInternalIds,
					productStatesContext,
				})
			) {
				continue;
			}
			if (
				planHasChildVariants({
					planId: variant.variant_plan_id,
					productStatesContext,
				})
			) {
				throw new RecaseError({
					message: "Cannot create a variant from another variant.",
					code: ErrCode.NestedVariantNotAllowed,
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

	const mintSource = upsert.row.versioning === "new_version";
	if (mintSource) {
		const duplicateTarget = findDuplicate(
			propagateTargets.map((target) => target.plan_id),
		);
		if (duplicateTarget) {
			throw new RecaseError({
				message: `Duplicate propagate target ${duplicateTarget}: new_version takes one target per plan`,
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
	}

	for (const target of propagateTargets) {
		if (target.plan_id === upsert.row.planId) {
			rejectInvalidPropagationTarget({ planId: target.plan_id });
		}
		if (mintSource && propagateTargetIsPinned({ target })) {
			throw new RecaseError({
				message: `Propagate target ${target.plan_id} cannot pin a version when versioning is new_version; the server resolves the row`,
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
		if (!mintSource && !propagateTargetIsPinned({ target })) {
			// A config pins nothing: an unpinned variant follows the row anchored
			// to the edited base when there is one, and has nothing to follow yet
			// when the variant is being created in this same push.
			continue;
		}
		const targetRow = variantRowForPropagateTarget({
			target,
			anchorInternalIds: editedSourceInternalIds,
			productStatesContext,
		});
		if (!targetRow) {
			rejectInvalidPropagationTarget({ planId: target.plan_id });
		}
		const anchor = targetRow.base_internal_product_id;
		if (!anchor || !editedSourceInternalIds.has(anchor)) {
			throw new RecaseError({
				message: `Propagation target ${target.plan_id}@v${targetRow.version} is not anchored to an edited row of ${upsert.row.planId}`,
				code: ErrCode.InvalidPropagationTarget,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
		if (
			mintSource &&
			targetRow.version <
				maxVersionForPlan({
					planId: target.plan_id,
					productStatesContext,
				}) &&
			rowHasVersionableCustomers({ row: targetRow, productStatesContext })
		) {
			throw new RecaseError({
				message: `Cannot propagate a new version onto ${target.plan_id}@v${targetRow.version}: historical version has customers`,
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
	}
};
