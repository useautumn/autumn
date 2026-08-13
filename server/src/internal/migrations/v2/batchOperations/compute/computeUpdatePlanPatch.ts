import type { Feature, FullProduct } from "@autumn/shared";
import type { PlanFilter } from "@autumn/shared/api/migrations/filters/planFilter.js";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import { computePatchProductTransitions } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computePatchProductTransitions.js";
import type { MigrationRuntime } from "@/internal/migrations/v2/types/migrationDefinition.js";
import { resolveOperationScope } from "../scope/resolveOperationScope.js";
import type {
	BatchMigrationPatch,
	BatchMigrationRejection,
} from "../types/index.js";
import { checkUpdatePlanTransitionEligibility } from "./guards/index.js";
import { computeBatchMigrationLicenseOperations } from "./operations/computeBatchMigrationLicenseOperations.js";
import { computeBatchMigrationOperations } from "./operations/index.js";
import { resolvePreparedAddItemEntitlements } from "./utils/resolvePreparedAddItemEntitlements.js";

/** Computes one (op, fromProduct) pair into an add-only batch patch: resolve
 * prepared rows → diff → lower → guard. No patch and no rejections = no-op. */
export const computeUpdatePlanPatch = ({
	migration,
	op,
	opIndex,
	fromProduct,
	planFilters,
	features,
}: {
	migration: MigrationRuntime;
	op: UpdatePlanOp;
	opIndex: number;
	fromProduct: FullProduct;
	/** The matched disjunct's $or-free conjunct filters. */
	planFilters: PlanFilter[];
	features: Feature[];
}): { patch?: BatchMigrationPatch; rejections: BatchMigrationRejection[] } => {
	if (!op.customize) return { rejections: [] };

	const { entitlements: addItemEntitlements, rejections: preparedRejections } =
		resolvePreparedAddItemEntitlements({
			migration,
			op,
			opIndex,
			fromProduct,
			features,
		});
	if (preparedRejections.length > 0) return { rejections: preparedRejections };

	const { operations: licenseOperations, rejections: licenseRejections } =
		computeBatchMigrationLicenseOperations({
			migration,
			op,
			opIndex,
			fromProduct,
			features,
		});
	if (licenseRejections.length > 0) return { rejections: licenseRejections };

	if (addItemEntitlements.length === 0 && licenseOperations.length === 0) {
		return { rejections: [] };
	}

	const productTransitions = computePatchProductTransitions({
		fromProduct,
		addEntitlements: addItemEntitlements,
	});

	const operations = computeBatchMigrationOperations({
		addedEntitlementPrices: productTransitions.entitlementPrices.added,
	});

	const rejections = checkUpdatePlanTransitionEligibility({
		opIndex,
		fromProduct,
		productTransitions,
		operations,
	});
	if (rejections.length > 0) return { rejections };
	if (operations.length === 0 && licenseOperations.length === 0) {
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
			operations: {
				entitlements: operations,
				licenseEntitlements: licenseOperations,
			},
		},
	};
};
