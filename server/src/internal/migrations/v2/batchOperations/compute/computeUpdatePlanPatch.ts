import type { Feature, FullProduct } from "@autumn/shared";
import type { PlanFilter } from "@autumn/shared/api/migrations/filters/planFilter.js";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import { computeProductTransitions } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeProductTransitions.js";
import type { MigrationRuntime } from "@/internal/migrations/v2/types/migrationDefinition.js";
import { resolveOperationScope } from "../scope/resolveOperationScope.js";
import type {
	BatchMigrationOperations,
	BatchMigrationPatch,
	BatchMigrationRejection,
	PatchProductTransition,
} from "../types/index.js";
import { checkUpdatePlanTransitionEligibility } from "./guards/index.js";
import {
	computeBatchMigrationOperations,
	computePatchProductOperations,
} from "./operations/index.js";
import { computePatchProductTransition } from "./transitions/computePatchProductTransition.js";
import { resolvePlanLicenseTransitions } from "./transitions/resolvePlanLicenseTransitions.js";
import { resolveTargetFullProduct } from "./transitions/resolveTargetFullProduct.js";
import { resolveVersionTargetProduct } from "./transitions/resolveVersionTargetProduct.js";
import { resolvePreparedAddItemEntitlements } from "./utils/resolvePreparedAddItemEntitlements.js";

const hasItemCustomize = ({ op }: { op: UpdatePlanOp }) =>
	(op.customize?.add_items?.length ?? 0) > 0 ||
	(op.customize?.remove_items?.length ?? 0) > 0;

const operationsAreEmpty = ({
	operations,
}: {
	operations: BatchMigrationOperations;
}) =>
	operations.addEntitlements.length === 0 &&
	operations.removeEntitlements.length === 0 &&
	operations.replaceEntitlements.length === 0 &&
	operations.licenseEntitlements.length === 0 &&
	operations.repointCustomerProduct === undefined;

const finishPatch = ({
	migration,
	opIndex,
	fromProduct,
	toProduct,
	planFilters,
	operations,
}: {
	migration: MigrationRuntime;
	opIndex: number;
	fromProduct: FullProduct;
	toProduct: FullProduct;
	planFilters: PlanFilter[];
	operations: BatchMigrationOperations;
}): { patch?: BatchMigrationPatch; rejections: BatchMigrationRejection[] } => {
	if (operationsAreEmpty({ operations })) return { rejections: [] };

	const resolvedScope = resolveOperationScope({
		migration,
		planFilters,
		internalProductId: fromProduct.internal_id,
	});
	if (resolvedScope.unsupportedField !== undefined) {
		return {
			rejections: [
				{
					code: "unsupported_plan_filter",
					opIndex,
					message: `plan_filter ${resolvedScope.unsupportedField} cannot be batch-lowered: unprovable matcher form, $or placement, or conflicting filter levels.`,
				},
			],
		};
	}

	return {
		rejections: [],
		patch: {
			opIndex,
			scope: resolvedScope.scope,
			planId: fromProduct.id,
			fromProduct,
			toProduct,
			operations,
		},
	};
};

const computeCustomizePatch = ({
	migration,
	op,
	opIndex,
	fromProduct,
	targetProduct,
	planFilters,
	features,
}: {
	migration: MigrationRuntime;
	op: UpdatePlanOp;
	opIndex: number;
	fromProduct: FullProduct;
	targetProduct: FullProduct;
	planFilters: PlanFilter[];
	features: Feature[];
}): { patch?: BatchMigrationPatch; rejections: BatchMigrationRejection[] } => {
	const { entitlements: minted, rejections: mintedRejections } =
		resolvePreparedAddItemEntitlements({
			migration,
			op,
			opIndex,
			fromProduct: targetProduct,
			features,
		});
	if (mintedRejections.length > 0) return { rejections: mintedRejections };

	const { links: licenseLinks, rejections: licenseRejections } =
		resolvePlanLicenseTransitions({
			migration,
			op,
			opIndex,
			fromProduct,
			toProduct: targetProduct,
			features,
		});
	if (licenseRejections.length > 0) return { rejections: licenseRejections };

	const patchTransition: PatchProductTransition = computePatchProductTransition(
		{
			fromProduct,
			toProduct: targetProduct,
			removeItems: op.customize?.remove_items,
			addEntitlementPrices: minted.map((entitlement) => ({ entitlement })),
		},
	);

	const operations = computePatchProductOperations({
		patchTransition,
		licenseLinks,
	});

	const rejections = checkUpdatePlanTransitionEligibility({
		opIndex,
		fromProduct,
		toProduct: targetProduct,
		patchTransition,
		licenseLinks,
		operations: operations.addEntitlements,
	});
	if (rejections.length > 0) return { rejections };

	return finishPatch({
		migration,
		opIndex,
		fromProduct,
		toProduct: targetProduct,
		planFilters,
		operations,
	});
};

/** Computes one (op, fromProduct) pair into a batch patch: resolve the target
 * product → diff items and licenses → lower → guard. No patch and no
 * rejections = no-op. */
export const computeUpdatePlanPatch = ({
	migration,
	op,
	opIndex,
	fromProduct,
	planFilters,
	features,
	productsByPlanVersion,
}: {
	migration: MigrationRuntime;
	op: UpdatePlanOp;
	opIndex: number;
	fromProduct: FullProduct;
	/** The matched disjunct's $or-free conjunct filters. */
	planFilters: PlanFilter[];
	features: Feature[];
	productsByPlanVersion: ReadonlyMap<string, FullProduct>;
}): { patch?: BatchMigrationPatch; rejections: BatchMigrationRejection[] } => {
	const { targetProduct, rejections: targetRejections } =
		resolveVersionTargetProduct({
			productsByPlanVersion,
			fromProduct,
			targetVersion: op.version,
			opIndex,
		});
	if (!targetProduct) return { rejections: targetRejections };

	if (hasItemCustomize({ op })) {
		return computeCustomizePatch({
			migration,
			op,
			opIndex,
			fromProduct,
			targetProduct,
			planFilters,
			features,
		});
	}

	const {
		toProduct,
		hasItemChanges,
		rejections: targetFullProductRejections,
	} = resolveTargetFullProduct({
		migration,
		op,
		opIndex,
		fromProduct,
		targetProduct,
		features,
	});
	if (!toProduct) return { rejections: targetFullProductRejections };

	const { links: licenseLinks, rejections: licenseRejections } =
		resolvePlanLicenseTransitions({
			migration,
			op,
			opIndex,
			fromProduct,
			toProduct,
			features,
		});
	if (licenseRejections.length > 0) return { rejections: licenseRejections };

	if (
		op.version === undefined &&
		!hasItemChanges &&
		licenseLinks.length === 0
	) {
		return { rejections: [] };
	}

	const productTransitions = computeProductTransitions({
		fromProduct,
		toProduct,
	});

	const operations = computeBatchMigrationOperations({
		productTransitions,
		licenseLinks,
	});

	const rejections = checkUpdatePlanTransitionEligibility({
		opIndex,
		fromProduct,
		productTransitions,
		licenseLinks,
		operations: operations.addEntitlements,
	});
	if (rejections.length > 0) return { rejections };

	return finishPatch({
		migration,
		opIndex,
		fromProduct,
		toProduct: productTransitions.toProduct,
		planFilters,
		operations,
	});
};
