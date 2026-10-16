import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { iterateCustomerProductPages } from "@/internal/migrations/v2/batchOperations/execute/customerProductPagination/index.js";
import {
	BATCH_MIGRATION_CANDIDATE_ROW_BATCH,
	BATCH_MIGRATION_FEATURE_OP_CONCURRENCY,
} from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import { mapWithConcurrency } from "@/internal/migrations/v2/batchOperations/execute/utils/mapWithConcurrency.js";
import type {
	BatchMigrationExecutionPatch,
	BatchMigrationExecutionRemove,
} from "@/internal/migrations/v2/batchOperations/types/index.js";
import {
	type RemoveCandidateRow,
	selectRemoveCandidateRows,
} from "../removeCustomerEntitlementsForPage/selectRemoveCandidateRows.js";

const selectRemoveCandidatesForOp = async ({
	ctx,
	patch,
	remove,
	internalCustomerIds,
}: {
	ctx: AutumnContext;
	patch: BatchMigrationExecutionPatch;
	remove: BatchMigrationExecutionRemove;
	internalCustomerIds: string[];
}): Promise<RemoveCandidateRow[]> => {
	const rows: RemoveCandidateRow[] = [];
	await iterateCustomerProductPages({
		db: ctx.db,
		pageSize: BATCH_MIGRATION_CANDIDATE_ROW_BATCH,
		executePage: async ({
			transaction,
			afterCustomerProductId,
			limit,
			assertWithinCeiling,
		}) => {
			const page = await selectRemoveCandidateRows({
				db: transaction,
				features: ctx.features,
				internalCustomerIds,
				scope: patch.scope,
				filter: remove.from,
				afterCustomerProductId,
				limit,
			});
			assertWithinCeiling(page.length);
			return { rows: page, result: page };
		},
		onCommit: (page) => {
			rows.push(...page);
		},
	});
	return rows;
};

export const selectPatchRemoveCandidates = async ({
	ctx,
	patch,
	internalCustomerIds,
}: {
	ctx: AutumnContext;
	patch: BatchMigrationExecutionPatch;
	internalCustomerIds: string[];
}): Promise<RemoveCandidateRow[]> => {
	if (internalCustomerIds.length === 0) return [];
	const rowsPerOp = await mapWithConcurrency({
		items: patch.removeEntitlementOps,
		concurrency: BATCH_MIGRATION_FEATURE_OP_CONCURRENCY,
		run: (remove) =>
			selectRemoveCandidatesForOp({
				ctx,
				patch,
				remove,
				internalCustomerIds,
			}),
	});
	return rowsPerOp.flat();
};
