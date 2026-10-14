import type { DrizzleCli } from "@/db/initDrizzle.js";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import {
	BATCH_MIGRATION_MAX_CANDIDATE_ROWS_PER_PAGE,
	BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
} from "../utils/batchMigrationExecutionConstants.js";

export const iterateCustomerProductPages = async <
	Row extends { customerProductId: string },
	Result,
>({
	db,
	pageSize,
	executePage,
	onCommit,
}: {
	db: DrizzleCli;
	pageSize: number;
	executePage: (args: {
		transaction: DrizzleCli;
		afterCustomerProductId: string | undefined;
		limit: number;
		assertWithinCeiling: (selectedCount: number) => void;
	}) => Promise<{ rows: Row[]; result: Result }>;
	onCommit: (result: Result) => void;
}): Promise<{ rowCount: number }> => {
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
		const { rows, result } = await withStatementTimeout(
			db,
			(transaction) =>
				executePage({
					transaction,
					afterCustomerProductId,
					limit: pageSize,
					assertWithinCeiling,
				}),
			BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
			{ forceCustomPlan: true },
		);
		onCommit(result);
		if (rows.length === 0) break;
		rowCount += rows.length;
		afterCustomerProductId = rows[rows.length - 1].customerProductId;
		if (rows.length < pageSize) break;
	}

	return { rowCount };
};
