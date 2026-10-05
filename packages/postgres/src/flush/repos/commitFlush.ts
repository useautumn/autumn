import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { inlineSqlParams } from "../../common/inlineSqlParams.js";
import { RowsInvalidError } from "../../common/parseRows.js";
import {
	PostgresSqlState,
	postgresSqlStateOf,
} from "../../common/postgresErrors.js";
import { foldSubjectRowChanges } from "../../subjects/repos/applySubjectRowUpdates/foldSubjectRowChanges.js";
import type { SubjectRowChange } from "../../subjects/types/subjectRowChange.js";
import { subjectRowChangeLanded } from "../../subjects/types/subjectRowChange.js";
import type { PostgresDb } from "../../types/postgresClient.js";
import type { FlushRequest, FlushResult } from "../types/flush.js";
import {
	FLUSH_ROLLBACK_MARKER,
	flushSql,
	singleStatementFlushSql,
} from "./flushSql.js";

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

/** How a flush reaches Postgres: four round trips in an explicit transaction, or one simple query. */
export type FlushRoundTrips = "transaction" | "single";

/**
 * BEGIN · SET LOCAL statement_timeout · one statement · COMMIT, or ROLLBACK when a bookmark or a guarded row did not move.
 * `single` sends `SET LOCAL statement_timeout; statement` as one simple query: one round trip, one implicit transaction.
 */
export const commitFlush = async ({
	ctx,
	request,
	statementTimeoutMs,
	roundTrips = "transaction",
}: {
	ctx: {
		db: Pick<PostgresDb, "transaction" | "execute">;
		/** Times the synchronous parts (folding the changes, building the statement) so a stall can be attributed to them. */
		timing?: <Value>(label: string, run: () => Value) => Value;
	};
	request: FlushRequest;
	statementTimeoutMs: number;
	roundTrips?: FlushRoundTrips;
}): Promise<FlushResult> => {
	const time = ctx.timing ?? ((_label, run) => run());
	const { folded, foldedIndexOf } = time("flush.fold", () =>
		foldSubjectRowChanges({ changes: request.changes }),
	);
	if (request.bookmarks.length === 0)
		return { applied: foldedIndexOf.map(() => true) };

	const outcome =
		roundTrips === "single"
			? await runFlushStatement({
					ctx: { db: ctx.db, timing: time },
					request,
					folded,
					statementTimeoutMs,
				})
			: await runFlushTransaction({
					ctx: { db: ctx.db, timing: time },
					request,
					folded,
					statementTimeoutMs,
				});
	const landed = folded.map((change, index) =>
		subjectRowChangeLanded({ change, touched: outcome.applied[index] ?? 0 }),
	);

	// A change folded away (inserted then deleted in this flush) applied by definition.
	return {
		applied: foldedIndexOf.map(
			(index) => index === null || landed[index] === true,
		),
	};
};

type FlushOutcome = z.infer<typeof outcomeSchema>;

const parseOutcome = ({ row }: { row: unknown }): FlushOutcome => {
	const parsed = outcomeSchema.safeParse(row);
	if (!parsed.success) {
		throw new RowsInvalidError({
			table: "flush",
			issues: parsed.error.issues,
		});
	}
	return parsed.data;
};

const assertBookmarksAdvanced = ({
	request,
	outcome,
}: {
	request: FlushRequest;
	outcome: FlushOutcome;
}) => {
	if (outcome.bookmarks !== request.bookmarks.length) {
		throw new FlushBookmarkConflictError({
			expected: request.bookmarks.length,
			advanced: outcome.bookmarks,
		});
	}
};

const guardMissed = ({
	folded,
	outcome,
}: {
	folded: readonly SubjectRowChange[];
	outcome: FlushOutcome;
}) =>
	folded.some(
		(change, index) =>
			!subjectRowChangeLanded({
				change,
				touched: outcome.applied[index] ?? 0,
			}),
	);

/** The counts this flush aborted with: only Postgres's own 22P02 text for this flush's marker, never a value it echoes. */
const rolledBackOutcomeOf = ({
	error,
	nonce,
}: {
	error: unknown;
	nonce: string;
}): FlushOutcome | null => {
	const rollback = new RegExp(
		`^invalid input syntax for type integer: "${FLUSH_ROLLBACK_MARKER}${nonce}:(\\d+):([\\d,]*)"$`,
	);
	for (let cause = error; cause instanceof Error; cause = cause.cause) {
		if (
			postgresSqlStateOf({ error: cause }) !==
			PostgresSqlState.InvalidTextRepresentation
		)
			continue;
		const match = rollback.exec(cause.message);
		if (!match) continue;
		return {
			bookmarks: Number(match[1]),
			applied: match[2] ? match[2].split(",").map(Number) : [],
		};
	}
	return null;
};

/** The rows of a simple query's last statement: a multi-statement query answers one result per statement. */
const lastResultRows = ({ results }: { results: unknown[] }): unknown[] => {
	const last = results.at(-1);
	return Array.isArray(last) ? last : results;
};

/**
 * One round trip: `SET LOCAL statement_timeout` and the statement share a simple query's implicit transaction, so a stale
 * bookmark or guarded row aborts it whole in Postgres and the same errors as the transaction come out.
 */
const runFlushStatement = async ({
	ctx,
	request,
	folded,
	statementTimeoutMs,
}: {
	ctx: {
		db: Pick<PostgresDb, "transaction" | "execute">;
		timing: <Value>(label: string, run: () => Value) => Value;
	};
	request: FlushRequest;
	folded: readonly SubjectRowChange[];
	statementTimeoutMs: number;
}): Promise<FlushOutcome> => {
	const nonce = randomUUID().replaceAll("-", "");
	const statement = ctx.timing("flush.sql", () =>
		inlineSqlParams({
			statement: singleStatementFlushSql({
				changes: folded,
				bookmarks: request.bookmarks,
				nonce,
			}),
		}),
	);
	// A value with no faithful literal keeps the bound statement, in the four-round-trip transaction.
	if (statement === null)
		return runFlushTransaction({ ctx, request, folded, statementTimeoutMs });
	let results: unknown[];
	try {
		results = await ctx.db.execute(
			sql.raw(
				`SET LOCAL statement_timeout = ${Math.trunc(statementTimeoutMs)}; ${statement}`,
			),
		);
	} catch (error) {
		const outcome = rolledBackOutcomeOf({ error, nonce });
		if (!outcome) throw error;
		assertBookmarksAdvanced({ request, outcome });
		return outcome;
	}
	return parseOutcome({ row: lastResultRows({ results })[0] });
};

/** The whole flush is one decision: a row whose guard no longer matches rolls back every row and the bookmarks with it. */
const runFlushTransaction = async ({
	ctx,
	request,
	folded,
	statementTimeoutMs,
}: {
	ctx: {
		db: Pick<PostgresDb, "transaction">;
		timing: <Value>(label: string, run: () => Value) => Value;
	};
	request: FlushRequest;
	folded: readonly SubjectRowChange[];
	statementTimeoutMs: number;
}): Promise<FlushOutcome> => {
	try {
		return await ctx.db.transaction(async (tx) => {
			await tx.execute(
				sql`SET LOCAL statement_timeout = ${sql.raw(String(Math.trunc(statementTimeoutMs)))}`,
			);
			const statement = ctx.timing("flush.sql", () =>
				flushSql({ changes: folded, bookmarks: request.bookmarks }),
			);
			const rows = await tx.execute(statement);
			const outcome = parseOutcome({ row: rows[0] });
			assertBookmarksAdvanced({ request, outcome });
			if (guardMissed({ folded, outcome }))
				throw new FlushRolledBack({ outcome });
			return outcome;
		});
	} catch (cause) {
		if (cause instanceof FlushRolledBack) return cause.outcome;
		throw cause;
	}
};
