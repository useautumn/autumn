import type { DrizzleCli } from "@/db/initDrizzle.js";
import { withMigrationBatchResult } from "../../../repos/migrationBatchResult/withMigrationBatchResult.js";
import type { MigrationBatchResultStorage } from "../recovery/types/migrationBatchResultStorage.js";
import { BATCH_MIGRATION_MAX_CANDIDATE_ROWS_PER_PAGE } from "../utils/batchMigrationExecutionConstants.js";

// Each batch commits independently; saved results reconstruct both changes and pagination.
export const iterateCustomerProductPages = async <
	Result extends { candidates: { customerProductId: string }[] },
	Stored extends Record<string, unknown> = Result,
>({
	db,
	pageSize,
	executePage,
	onPage,
	recovery,
}: {
	db: DrizzleCli;
	pageSize: number;
	/** Return every change needed on replay; call assertWithinCeiling before mutating. */
	executePage: (args: {
		transaction: DrizzleCli;
		afterCustomerProductId: string | undefined;
		limit: number;
		assertWithinCeiling: (selectedCount: number) => void;
	}) => Promise<Result>;
	/** Collects either a fresh or saved result after its transaction completes. */
	onPage?: (result: Result) => void;
	recovery?: {
		operationId?: string;
		operationType: string;
		orgId: string;
		env: string;
		input: Record<string, unknown>;
		resultStorage?: MigrationBatchResultStorage<Result, Stored>;
	};
}): Promise<{ rowCount: number }> => {
	if (recovery?.operationId === "")
		throw new Error("Migration operation identity must not be empty");
	const batchRecovery =
		recovery?.operationId === undefined
			? undefined
			: {
					...recovery,
					operationId: recovery.operationId,
					input: JSON.parse(
						JSON.stringify({
							...recovery.input,
							operationId: recovery.operationId,
							candidateRowBatchSize: pageSize,
						}),
					),
				};
	let afterCustomerProductId: string | undefined;
	let rowCount = 0;
	const assertWithinCeiling = (selectedCount: number) => {
		if (rowCount + selectedCount <= BATCH_MIGRATION_MAX_CANDIDATE_ROWS_PER_PAGE)
			return;
		throw new Error(
			`batch-migration: page exceeded ${BATCH_MIGRATION_MAX_CANDIDATE_ROWS_PER_PAGE} candidate rows — aborting run`,
		);
	};

	while (true) {
		const result = await withMigrationBatchResult({
			ctx: { db },
			recovery:
				batchRecovery === undefined
					? undefined
					: {
							orgId: batchRecovery.orgId,
							env: batchRecovery.env,
							batchId: JSON.stringify([
								batchRecovery.operationType,
								batchRecovery.operationId,
								afterCustomerProductId ?? null,
							]),
							input: {
								...batchRecovery.input,
								afterCustomerProductId: afterCustomerProductId ?? null,
							},
							resultStorage: batchRecovery.resultStorage,
						},
			forceCustomPlan: true,
			execute: ({ ctx }) =>
				executePage({
					transaction: ctx.db,
					afterCustomerProductId,
					limit: pageSize,
					assertWithinCeiling,
				}),
		});
		const rows = result.candidates;
		assertWithinCeiling(rows.length);
		onPage?.(result);
		if (rows.length === 0) break;
		rowCount += rows.length;
		afterCustomerProductId = rows[rows.length - 1].customerProductId;
		if (rows.length < pageSize) break;
	}

	return { rowCount };
};
