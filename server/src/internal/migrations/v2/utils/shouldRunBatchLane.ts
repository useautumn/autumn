import type { Feature, FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { computeBatchMigration } from "../batchOperations/compute/index.js";
import type {
	BatchMigrationPlan,
	BatchMigrationRejection,
} from "../batchOperations/types/index.js";
import type { MigrationRunControls } from "../cloudAdapter/types.js";
import type {
	MigrationRuntime,
	MigrationRuntimeWithEventId,
} from "../types/migrationDefinition.js";

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

export const isBatchEligibleMigrationDefinition = ({
	migration,
	products,
	features,
}: {
	migration: MigrationRuntime;
	products: FullProduct[];
	features: Feature[];
}): boolean => {
	if (!migration.operations) return false;

	const computed = computeBatchMigration({ migration, products, features });
	if (computed.computable) return computed.plan.patches.length > 0;
	return computed.rejections.every(
		(rejection) => rejection.code === "missing_prepared_state",
	);
};

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
	controls?.limit == null &&
	controls?.checkpoint !== false;

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
	const notComputable = (rejections: BatchMigrationRejection[]) => {
		ctx.logger.info("batch-migration: not computable, per-customer lane", {
			data: { migrationRunId, rejections },
		});
		return { shouldRun: false, reason: "not_computable", rejections } as const;
	};
	if (!computed.computable) return notComputable(computed.rejections);
	if (computed.plan.patches.length === 0)
		return { shouldRun: false, reason: "no_batch_patches" };

	return { shouldRun: true, plan: computed.plan };
};
