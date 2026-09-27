import { type EventInsert, events } from "@autumn/shared";
import type { PostgresDb } from "../../types/postgresClient.js";

// 17 columns a row, so this stays far under Postgres's 65,535 parameters per statement.
const ROWS_PER_INSERT = 1_000;
/** SQLSTATE classes that belong to a row, not to the moment: a broken constraint (23) or a value Postgres cannot store (22). */
const ROW_REFUSED_SQLSTATE = /^(22|23)/;

export type RefusedUsageEvent = { event: EventInsert; cause: unknown };

export type UsageEventsInsertResult = {
	/** Rows written now. A row whose id was already there is in neither list: it landed on an earlier attempt. */
	insertedIds: string[];
	/** Rows Postgres will never take. Left out so they cannot hold back the rest of their batch. */
	refused: RefusedUsageEvent[];
};

const isRowRefusal = (cause: unknown): boolean => {
	if (!(cause instanceof Error) || !("errno" in cause)) return false;
	return (
		typeof cause.errno === "string" && ROW_REFUSED_SQLSTATE.test(cause.errno)
	);
};

/**
 * Inserts the rows; when Postgres refuses the statement over a row, halves it until that row stands alone.
 * `insertRows` is one statement, returning the ids it wrote: the splitting knows nothing about the driver.
 */
export const insertIsolatingRefusals = async ({
	insertRows,
	rows,
	result,
}: {
	insertRows: (rows: EventInsert[]) => Promise<string[]>;
	rows: EventInsert[];
	result: UsageEventsInsertResult;
}): Promise<void> => {
	try {
		result.insertedIds.push(...(await insertRows(rows)));
	} catch (cause) {
		// Anything else (a dropped connection, a timeout) is the moment's fault: the caller retries the batch.
		if (!isRowRefusal(cause)) throw cause;
		const [only] = rows;
		if (rows.length === 1 && only) {
			result.refused.push({ event: only, cause });
			return;
		}
		const middle = Math.ceil(rows.length / 2);
		await insertIsolatingRefusals({
			insertRows,
			rows: rows.slice(0, middle),
			result,
		});
		await insertIsolatingRefusals({
			insertRows,
			rows: rows.slice(middle),
			result,
		});
	}
};

/** One row can never fail its batch: duplicates are skipped by id, and a row Postgres refuses is set aside and reported. */
export const insertUsageEvents = async ({
	ctx,
	events: rows,
}: {
	ctx: { db: PostgresDb };
	events: EventInsert[];
}): Promise<UsageEventsInsertResult> => {
	const result: UsageEventsInsertResult = { insertedIds: [], refused: [] };
	const insertRows = async (chunk: EventInsert[]): Promise<string[]> => {
		const inserted = await ctx.db
			.insert(events)
			.values(chunk)
			.onConflictDoNothing()
			.returning({ id: events.id });
		return inserted.map((row) => row.id);
	};
	for (let start = 0; start < rows.length; start += ROWS_PER_INSERT) {
		await insertIsolatingRefusals({
			insertRows,
			rows: rows.slice(start, start + ROWS_PER_INSERT),
			result,
		});
	}
	return result;
};
