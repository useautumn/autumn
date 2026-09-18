import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { RowsInvalidError } from "../../common/parseRows.js";
import { foldSubjectRowChanges } from "../../subjects/repos/applySubjectRowUpdates/foldSubjectRowChanges.js";
import type { PostgresDb } from "../../types/postgresClient.js";
import type { FlushRequest, FlushResult } from "../types/flush.js";
import { flushSql } from "./flushSql.js";

/** A bookmark that no longer holds the offset the caller saw: another writer moved the partition. */
export class FlushBookmarkConflictError extends Error {
	constructor({ expected, advanced }: { expected: number; advanced: number }) {
		super(`Flush advanced ${advanced} of ${expected} bookmarks`);
		this.name = "FlushBookmarkConflictError";
	}
}

const count = z.union([z.number(), z.string(), z.bigint()]).transform(Number);
const outcomeSchema = z.object({
	applied: z.union([
		z.array(count),
		z.string().transform((text) => z.array(count).parse(JSON.parse(text))),
	]),
	bookmarks: count,
});

/** BEGIN · SET LOCAL statement_timeout · one statement · COMMIT, or ROLLBACK when a bookmark did not move. */
export const commitFlush = async ({
	ctx,
	request,
	statementTimeoutMs,
}: {
	ctx: { db: Pick<PostgresDb, "transaction"> };
	request: FlushRequest;
	statementTimeoutMs: number;
}): Promise<FlushResult> => {
	const { folded, foldedIndexOf } = foldSubjectRowChanges({
		changes: request.changes,
	});
	if (request.bookmarks.length === 0)
		return { applied: foldedIndexOf.map(() => true) };

	const outcome = await ctx.db.transaction(async (tx) => {
		await tx.execute(
			sql`SET LOCAL statement_timeout = ${sql.raw(String(Math.trunc(statementTimeoutMs)))}`,
		);
		const rows = await tx.execute(
			flushSql({ changes: folded, bookmarks: request.bookmarks }),
		);
		const parsed = outcomeSchema.safeParse(rows[0]);
		if (!parsed.success) {
			throw new RowsInvalidError({
				table: "flush",
				issues: parsed.error.issues,
			});
		}
		if (parsed.data.bookmarks !== request.bookmarks.length) {
			throw new FlushBookmarkConflictError({
				expected: request.bookmarks.length,
				advanced: parsed.data.bookmarks,
			});
		}
		return parsed.data;
	});

	// A change folded away (inserted then deleted in this flush) applied by definition.
	return {
		applied: foldedIndexOf.map(
			(index) => index === null || (outcome.applied[index] ?? 0) === 1,
		),
	};
};
