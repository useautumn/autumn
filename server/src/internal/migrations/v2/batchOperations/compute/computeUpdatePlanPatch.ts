import type { Feature, FullProduct } from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import { computePatchProductTransitions } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computePatchProductTransitions.js";
import type { MigrationRuntime } from "@/internal/migrations/v2/types/migrationDefinition.js";
import type {
	BatchMigrationPatch,
	BatchMigrationRejection,
} from "../types/index.js";
import { checkUpdatePlanTransitionEligibility } from "./guards/index.js";
import { computeBatchMigrationOperations } from "./operations/index.js";
import { resolvePreparedAddItemEntitlements } from "./utils/resolvePreparedAddItemEntitlements.js";

/** Computes one (op, fromProduct) pair into an add-only batch patch: resolve
 * prepared rows → diff → lower → guard. No patch and no rejections = no-op. */
export const computeUpdatePlanPatch = ({
	migration,
	op,
	opIndex,
	fromProduct,
	features,
}: {
	migration: MigrationRuntime;
	op: UpdatePlanOp;
	opIndex: number;
	fromProduct: FullProduct;
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

	if (addItemEntitlements.length === 0) return { rejections: [] };

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
	if (operations.length === 0) return { rejections: [] };

	return {
		rejections: [],
		patch: {
			opIndex,
			planId: fromProduct.id,
			fromProduct,
			toProduct: productTransitions.toProduct,
			operations: { entitlements: operations },
		},
	};
};
