import type { z } from "zod/v4";
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
	rowIsRemovableSql,
} from "../removeCustomerEntitlementsForPage/selectRemoveCandidateRows.js";
import {
	HeldGrantColumnsSchema,
	heldGrantJoinSql,
	heldGrantSelectSql,
} from "../throughWorker/heldGrantColumnsSql.js";
import {
	buildLiveFilterCandidateQuery,
	LiveFilterCandidateCoreSchema,
	toLiveFilterCandidateRow,
} from "../utils/liveFilterCandidateSql.js";

export type HeldRemoveCandidateRow = RemoveCandidateRow &
	z.infer<typeof HeldGrantColumnsSchema>;

const selectForOp = async ({
	ctx,
	patch,
	remove,
	internalCustomerIds,
}: {
	ctx: AutumnContext;
	patch: BatchMigrationExecutionPatch;
	remove: BatchMigrationExecutionRemove;
	internalCustomerIds: string[];
}): Promise<HeldRemoveCandidateRow[]> => {
	const rows: HeldRemoveCandidateRow[] = [];
	await iterateCustomerProductPages({
		db: ctx.db,
		pageSize: BATCH_MIGRATION_CANDIDATE_ROW_BATCH,
		executePage: async ({
			transaction,
			afterCustomerProductId,
			limit,
			assertWithinCeiling,
		}) => {
			const selected = await transaction.execute(
				buildLiveFilterCandidateQuery({
					internalCustomerIds,
					scope: patch.scope,
					filter: remove.from,
					extraSelect: heldGrantSelectSql,
					extraJoins: heldGrantJoinSql,
					extraWhere: rowIsRemovableSql,
					afterCustomerProductId,
					limit,
				}),
			);
			assertWithinCeiling(selected.length);
			const page = selected.map((row) => ({
				...toLiveFilterCandidateRow({
					parsed: LiveFilterCandidateCoreSchema.parse(row),
					features: ctx.features,
				}),
				...HeldGrantColumnsSchema.parse(row),
			}));
			return { rows: page, result: page };
		},
		onCommit: (page) => {
			rows.push(...page);
		},
	});
	return rows;
};

/** Today's remove candidates, plus what the worker needs to hold and guard each row. */
export const selectHeldRemoveCandidates = async ({
	ctx,
	patch,
	internalCustomerIds,
}: {
	ctx: AutumnContext;
	patch: BatchMigrationExecutionPatch;
	internalCustomerIds: string[];
}): Promise<HeldRemoveCandidateRow[]> => {
	if (internalCustomerIds.length === 0) return [];
	const rowsPerOp = await mapWithConcurrency({
		items: patch.removeEntitlementOps,
		concurrency: BATCH_MIGRATION_FEATURE_OP_CONCURRENCY,
		run: (remove) => selectForOp({ ctx, patch, remove, internalCustomerIds }),
	});
	return rowsPerOp.flat();
};
