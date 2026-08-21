import type { Feature, FullProduct } from "@autumn/shared";
import type { PlanFilter } from "@autumn/shared/api/migrations/filters/planFilter.js";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import { computeProductTransitions } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeProductTransitions.js";
import type { MigrationRuntime } from "@/internal/migrations/v2/types/migrationDefinition.js";
import { resolveOperationScope } from "../scope/resolveOperationScope.js";
import type {
	BatchMigrationPatch,
	BatchMigrationRejection,
} from "../types/index.js";
import { checkUpdatePlanTransitionEligibility } from "./guards/index.js";
import { computeBatchMigrationOperations } from "./operations/index.js";
import { resolvePlanLicenseTransitions } from "./transitions/resolvePlanLicenseTransitions.js";
import { resolveTargetFullProduct } from "./transitions/resolveTargetFullProduct.js";
import { resolveVersionTargetProduct } from "./transitions/resolveVersionTargetProduct.js";

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
	if (
		operations.addEntitlements.length === 0 &&
		operations.removeEntitlements.length === 0 &&
		operations.replaceEntitlements.length === 0 &&
		operations.licenseEntitlements.length === 0 &&
		operations.repointCustomerProduct === undefined
	) {
		return { rejections: [] };
	}

	// Adds are additive, so customization is not an implicit exclusion — the
	// scope narrows only when the filter says so.
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
			toProduct: productTransitions.toProduct,
			operations,
		},
	};
};
