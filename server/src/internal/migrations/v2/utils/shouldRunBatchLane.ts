import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { computeBatchMigration } from "../batchOperations/compute/index.js";
import type {
	BatchMigrationPlan,
	BatchMigrationRejection,
} from "../batchOperations/types/index.js";
import type { MigrationRunControls } from "../cloudAdapter/types.js";
import type { MigrationRuntimeWithEventId } from "../types/migrationDefinition.js";

export type BatchLaneDecision =
	| { shouldRun: true; plan: BatchMigrationPlan }
	| {
			shouldRun: false;
			reason:
				| "cloud_adapter"
				| "ineligible_run"
				| "not_computable"
				| "no_batch_patches";
			rejections?: BatchMigrationRejection[];
	  };

/**
 * A run is batch-eligible only in its plain form — anything that scopes,
 * previews, retries, or hooks into per-item processing keeps the
 * per-customer lane's exact semantics.
 */
const isBatchEligibleRun = ({
	dryRun,
	controls,
	hasCustomHooks,
}: {
	dryRun: boolean;
	controls?: MigrationRunControls;
	hasCustomHooks: boolean;
}): boolean =>
	!dryRun &&
	!hasCustomHooks &&
	!controls?.only?.length &&
	controls?.limit == null &&
	!controls?.retryItemStatuses?.length &&
	controls?.checkpoint !== false;

/**
 * Single decision point for which lane a run takes. All-or-nothing: when
 * this says yes, the batch lane owns the ENTIRE run and the per-customer
 * scope iteration is skipped; when it says no, the run is per-customer
 * end-to-end. The two lanes never process the same run.
 */
export const shouldRunBatchLane = async ({
	ctx,
	migration,
	migrationRunId,
	dryRun,
	controls,
	hasCustomHooks,
	hasCloudBatchAdapter,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntimeWithEventId;
	migrationRunId: string;
	dryRun: boolean;
	controls?: MigrationRunControls;
	hasCustomHooks: boolean;
	hasCloudBatchAdapter: boolean;
}): Promise<BatchLaneDecision> => {
	if (hasCloudBatchAdapter)
		return { shouldRun: false, reason: "cloud_adapter" };
	if (!isBatchEligibleRun({ dryRun, controls, hasCustomHooks }))
		return { shouldRun: false, reason: "ineligible_run" };

	const products = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		returnAll: true,
	});
	const computed = computeBatchMigration({
		migration,
		products,
		features: ctx.features,
	});
	if (!computed.computable) {
		ctx.logger.info("batch-migration: not computable, per-customer lane", {
			data: { migrationRunId, rejections: computed.rejections },
		});
		return {
			shouldRun: false,
			reason: "not_computable",
			rejections: computed.rejections,
		};
	}
	if (computed.plan.patches.length === 0)
		return { shouldRun: false, reason: "no_batch_patches" };

	return { shouldRun: true, plan: computed.plan };
};
