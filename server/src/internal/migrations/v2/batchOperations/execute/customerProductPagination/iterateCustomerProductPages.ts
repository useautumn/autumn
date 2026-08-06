import type { DrizzleCli } from "@/db/initDrizzle.js";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import {
	BATCH_MIGRATION_MAX_CANDIDATE_ROWS_PER_PAGE,
	BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
} from "../utils/batchMigrationExecutionConstants.js";

/**
 * Iterates an operation over a customer page's scope-matched customer
 * products in cp.id-keyset pages: one bounded transaction per `executePage`
 * call. The rows a call returns drive the cursor; a short page ends the
 * iteration.
 *
 * Partial iterations are safe by design: every mutation is dedup-idempotent
 * and the customer page's claims stay `running` until the marks land, so a
 * failure keeps committed pages, aborts only the current one, and a replay
 * converges.
 */
export const iterateCustomerProductPages = async <
	Row extends { customerProductId: string },
>({
	db,
	pageSize,
	executePage,
}: {
	db: DrizzleCli;
	pageSize: number;
	/** Select + mutate one page inside `transaction`; returns the rows it
	 * visited (selected, whether or not they were mutated). Must call
	 * `assertWithinCeiling` after selecting and before mutating, so the runaway
	 * ceiling trips without committing a partial page. */
	executePage: (args: {
		transaction: DrizzleCli;
		afterCustomerProductId: string | undefined;
		limit: number;
		assertWithinCeiling: (selectedCount: number) => void;
	}) => Promise<Row[]>;
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
		const rows = await withStatementTimeout(
			db,
			(transaction) =>
				executePage({
					transaction,
					afterCustomerProductId,
					limit: pageSize,
					assertWithinCeiling,
				}),
			BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
		);
		if (rows.length === 0) break;
		rowCount += rows.length;
		afterCustomerProductId = rows[rows.length - 1].customerProductId;
		if (rows.length < pageSize) break;
	}

	return { rowCount };
};
