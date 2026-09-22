import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { RowsInvalidError } from "../../common/parseRows.js";
import { foldSubjectRowChanges } from "../../subjects/repos/applySubjectRowUpdates/foldSubjectRowChanges.js";
import type { SubjectRowChange } from "../../subjects/types/subjectRowChange.js";
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

/** Carries the outcome out of a transaction that must not commit: a stale row means nothing of the flush lands. */
class FlushRolledBack extends Error {
	readonly outcome: z.infer<typeof outcomeSchema>;

	constructor({ outcome }: { outcome: z.infer<typeof outcomeSchema> }) {
		super("Flush rolled back: a guarded row no longer matched");
		this.name = "FlushRolledBack";
		this.outcome = outcome;
	}
}

/** BEGIN · SET LOCAL statement_timeout · one statement · COMMIT, or ROLLBACK when a bookmark or a guarded row did not move. */
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

	const outcome = await runFlushTransaction({
		ctx,
		request,
		folded,
		statementTimeoutMs,
	});

	// A change folded away (inserted then deleted in this flush) applied by definition.
	return {
		applied: foldedIndexOf.map(
			(index) => index === null || (outcome.applied[index] ?? 0) === 1,
		),
	};
};

/** The whole flush is one decision: a row whose guard no longer matches rolls back every row and the bookmarks with it. */
const runFlushTransaction = async ({
	ctx,
	request,
	folded,
	statementTimeoutMs,
}: {
	ctx: { db: Pick<PostgresDb, "transaction"> };
	request: FlushRequest;
	folded: readonly SubjectRowChange[];
	statementTimeoutMs: number;
}): Promise<z.infer<typeof outcomeSchema>> => {
	try {
		return await ctx.db.transaction(async (tx) => {
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
			if (parsed.data.applied.some((count) => count !== 1))
				throw new FlushRolledBack({ outcome: parsed.data });
			return parsed.data;
		});
	} catch (cause) {
		if (cause instanceof FlushRolledBack) return cause.outcome;
		throw cause;
	}
};
