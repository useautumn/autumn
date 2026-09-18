import { type SQL, sql } from "drizzle-orm";
import { subjectRowChangeSql } from "../../subjects/repos/applySubjectRowUpdates/subjectRowUpdateSql.js";
import type { SubjectRowChange } from "../../subjects/types/subjectRowChange.js";
import type { FlushBookmark } from "../types/flush.js";

/** Every folded change as its own CTE, the bookmarks as one, and a row of counts to read the outcome from. */
export const flushSql = ({
	changes,
	bookmarks,
}: {
	changes: readonly SubjectRowChange[];
	bookmarks: readonly FlushBookmark[];
}): SQL => {
	const updateCtes = changes.map(
		(change, index) =>
			sql`${sql.identifier(`u${index}`)} AS (${subjectRowChangeSql({ change })})`,
	);
	const appliedCounts = changes.map(
		(_, index) => sql`(SELECT count(*) FROM ${sql.identifier(`u${index}`)})`,
	);
	const bookmarkRows = bookmarks.map(
		(bookmark) =>
			sql`(${bookmark.topic}, ${bookmark.partition}, ${bookmark.expectedOffset}, ${bookmark.nextOffset})`,
	);
	const bookmarkCte = sql`b AS (
		UPDATE partition_progress p
		SET next_offset = v.next_offset::bigint
		FROM (VALUES ${sql.join(bookmarkRows, sql`, `)}) AS v(topic, partition_id, expected_offset, next_offset)
		WHERE p.topic = v.topic::text
			AND p.partition_id = v.partition_id::integer
			AND p.next_offset = v.expected_offset::bigint
		RETURNING p.topic
	)`;
	const applied =
		appliedCounts.length === 0
			? sql`'[]'::json`
			: sql`json_build_array(${sql.join(appliedCounts, sql`, `)})`;

	return sql`
		WITH ${sql.join([...updateCtes, bookmarkCte], sql`, `)}
		SELECT ${applied} AS applied, (SELECT count(*) FROM b) AS bookmarks
	`;
};
