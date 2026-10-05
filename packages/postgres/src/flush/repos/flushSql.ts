import { type SQL, sql } from "drizzle-orm";
import { subjectRowChangeSql } from "../../subjects/repos/applySubjectRowUpdates/subjectRowUpdateSql.js";
import type { SubjectRowChange } from "../../subjects/types/subjectRowChange.js";
import type { FlushBookmark } from "../types/flush.js";

/** The CTEs every flush shape shares: one per folded change, then the bookmarks as `b`. */
const flushParts = ({
	changes,
	bookmarks,
}: {
	changes: readonly SubjectRowChange[];
	bookmarks: readonly FlushBookmark[];
}) => {
	const updateCtes = changes.map(
		(change, index) =>
			sql`${sql.identifier(`u${index}`)} AS (${subjectRowChangeSql({ change })})`,
	);
	const appliedCounts = changes.map(
		(_, index) => sql`(SELECT count(*) FROM ${sql.identifier(`u${index}`)})`,
	);
	const bookmarkRows = bookmarks.map(
		(bookmark) =>
			sql`(${bookmark.topic}, ${bookmark.partition}, ${bookmark.expectedOffset}, ${bookmark.nextOffset}, ${bookmark.commandNextOffset ?? null}, ${bookmark.ownerFence?.epoch ?? null}, ${bookmark.ownerFence?.offset ?? null}, ${bookmark.claimToken ?? null})`,
	);
	// A fence only replaces a lower epoch's, and its offset travels with it: the pair is one fact.
	const bookmarkCte = sql`b AS (
		UPDATE partition_progress p
		SET next_offset = v.next_offset::bigint,
			command_next_offset = GREATEST(v.command_next_offset::bigint, p.command_next_offset),
			owner_epoch = CASE WHEN v.owner_epoch::bigint > COALESCE(p.owner_epoch, -1) THEN v.owner_epoch::bigint ELSE p.owner_epoch END,
			owner_fence_offset = CASE WHEN v.owner_epoch::bigint > COALESCE(p.owner_epoch, -1) THEN v.owner_fence_offset::bigint ELSE p.owner_fence_offset END
		FROM (VALUES ${sql.join(bookmarkRows, sql`, `)}) AS v(topic, partition_id, expected_offset, next_offset, command_next_offset, owner_epoch, owner_fence_offset, claim_token)
		WHERE p.topic = v.topic::text
			AND p.partition_id = v.partition_id::integer
			AND p.next_offset = v.expected_offset::bigint
			AND (v.claim_token::text IS NULL OR p.claim_token IS NULL OR p.claim_token = v.claim_token::text)
		RETURNING p.topic
	)`;
	const applied =
		appliedCounts.length === 0
			? sql`'[]'::json`
			: // An array constructor, not json_build_array: a function call is capped at 100 arguments.
				sql`to_json(ARRAY[${sql.join(appliedCounts, sql`, `)}])`;
	return { ctes: [...updateCtes, bookmarkCte], appliedCounts, applied };
};

/** Every folded change as its own CTE, the bookmarks as one, and a row of counts to read the outcome from. */
export const flushSql = ({
	changes,
	bookmarks,
}: {
	changes: readonly SubjectRowChange[];
	bookmarks: readonly FlushBookmark[];
}): SQL => {
	const { ctes, applied } = flushParts({ changes, bookmarks });
	return sql`
		WITH ${sql.join(ctes, sql`, `)}
		SELECT ${applied} AS applied, (SELECT count(*) FROM b) AS bookmarks
	`;
};

/** Prefixes the counts a single-statement flush carries out in the error that rolls it back. */
export const FLUSH_ROLLBACK_MARKER = "flush_rolled_back:";

/**
 * The same flush as one autocommit statement: when a bookmark or a guarded row did not move, a
 * failing cast aborts it, so nothing lands, and the error text carries `<nonce>:<bookmarks>:<counts>`.
 */
export const singleStatementFlushSql = ({
	changes,
	bookmarks,
	nonce,
}: {
	changes: readonly SubjectRowChange[];
	bookmarks: readonly FlushBookmark[];
	/** Per flush, so a value Postgres echoes in a cast error can never pass for this flush's rollback. */
	nonce: string;
}): SQL => {
	const { ctes, appliedCounts, applied } = flushParts({ changes, bookmarks });
	const bookmarkCount = sql`(SELECT count(*) FROM b)`;
	const landed = changes.flatMap((change, index) =>
		change.op === "promote" ? [] : [sql`${appliedCounts[index]} = 1`],
	);
	const allLanded = sql.join(
		[sql`${bookmarkCount} = ${bookmarks.length}::bigint`, ...landed],
		sql` AND `,
	);
	const counts =
		appliedCounts.length === 0
			? sql`''`
			: sql`array_to_string(ARRAY[${sql.join(appliedCounts, sql`, `)}], ',')`;
	// CASE, not OR: only CASE guarantees the cast is never evaluated when everything landed.
	return sql`
		WITH ${sql.join(ctes, sql`, `)}
		SELECT ${applied} AS applied, ${bookmarkCount} AS bookmarks
		WHERE CASE WHEN ${allLanded} THEN true
			ELSE (${`${FLUSH_ROLLBACK_MARKER}${nonce}:`}::text || ${bookmarkCount} || ':' || ${counts})::integer IS NULL END
	`;
};
