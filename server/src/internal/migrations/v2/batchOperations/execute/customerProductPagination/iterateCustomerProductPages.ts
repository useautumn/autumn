import type { DrizzleCli } from "@/db/initDrizzle.js";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import {
	BATCH_MIGRATION_MAX_CANDIDATE_ROWS_PER_PAGE,
	BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
} from "../utils/batchMigrationExecutionConstants.js";

/**
 * Iterates an operation over a customer page's scope-matched customer
 * products in cp.id-keyset pages: an advisory pre-count (also the runaway
 * tripwire), then one bounded transaction per `executePage` call. The rows
 * a call returns drive the cursor; a short page ends the iteration.
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
	countRows,
	executePage,
}: {
	db: DrizzleCli;
	pageSize: number;
	countRows: () => Promise<number>;
	/** Select + mutate one page inside `transaction`; returns the rows it
	 * visited (selected, whether or not they were mutated). */
	executePage: (args: {
		transaction: DrizzleCli;
		afterCustomerProductId: string | undefined;
		limit: number;
	}) => Promise<Row[]>;
}): Promise<{ rowCount: number }> => {
	const rowCount = await countRows();
	if (rowCount > BATCH_MIGRATION_MAX_CANDIDATE_ROWS_PER_PAGE) {
		throw new Error(
			`batch-migration: page has ${rowCount} candidate rows — exceeds the ${BATCH_MIGRATION_MAX_CANDIDATE_ROWS_PER_PAGE} safety ceiling`,
		);
	}

	let afterCustomerProductId: string | undefined;
	while (true) {
		const rows = await withStatementTimeout(
			db,
			(transaction) =>
				executePage({ transaction, afterCustomerProductId, limit: pageSize }),
			BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
		);
		if (rows.length === 0) break;
		afterCustomerProductId = rows[rows.length - 1].customerProductId;
		if (rows.length < pageSize) break;
	}

	return { rowCount };
};
