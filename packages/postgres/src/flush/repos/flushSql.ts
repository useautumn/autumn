import { type SQL, sql } from "drizzle-orm";
import { subjectRowChangeSql } from "../../subjects/repos/applySubjectRowUpdates/subjectRowUpdateSql.js";
import { subjectSnapshotFlushSql } from "../../subjects/repos/subjectSnapshots/subjectSnapshotFlushSql.js";
import type { SubjectRowChange } from "../../subjects/types/subjectRowChange.js";
import type { SubjectSnapshotWrites } from "../../subjects/types/subjectSnapshot.js";
import type { FlushBookmark } from "../types/flush.js";

const flushParts = ({
	changes,
	bookmarks,
	snapshots,
}: {
	changes: readonly SubjectRowChange[];
	bookmarks: readonly FlushBookmark[];
	snapshots?: SubjectSnapshotWrites;
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
			: sql`to_json(ARRAY[${sql.join(appliedCounts, sql`, `)}])`;
	const bookmarkParts =
		bookmarks.length > 0
			? { ctes: [bookmarkCte], count: sql`(SELECT count(*) FROM b)` }
			: { ctes: [], count: sql`0` };
	const hasSnapshotWrites =
		(snapshots?.upserts.length ?? 0) + (snapshots?.deletes.length ?? 0) > 0;
	const snapshotSql =
		snapshots && hasSnapshotWrites
			? subjectSnapshotFlushSql({ snapshots })
			: null;
	return {
		ctes: [...updateCtes, ...bookmarkParts.ctes, ...(snapshotSql?.ctes ?? [])],
		appliedCounts,
		applied,
		bookmarkCount: bookmarkParts.count,
		snapshotColumns: snapshotSql
			? sql`, ${snapshotSql.upserted} AS snapshot_upserts, ${snapshotSql.deleted} AS snapshot_deletes`
			: sql``,
	};
};

export const flushSql = ({
	changes,
	bookmarks,
	snapshots,
}: {
	changes: readonly SubjectRowChange[];
	bookmarks: readonly FlushBookmark[];
	snapshots?: SubjectSnapshotWrites;
}): SQL => {
	const { ctes, applied, bookmarkCount, snapshotColumns } = flushParts({
		changes,
		bookmarks,
		snapshots,
	});
	return sql`
		WITH ${sql.join(ctes, sql`, `)}
		SELECT ${applied} AS applied, ${bookmarkCount} AS bookmarks${snapshotColumns}
	`;
};

export const FLUSH_ROLLBACK_MARKER = "flush_rolled_back:";

export const singleStatementFlushSql = ({
	changes,
	bookmarks,
	snapshots,
	nonce,
}: {
	changes: readonly SubjectRowChange[];
	bookmarks: readonly FlushBookmark[];
	snapshots?: SubjectSnapshotWrites;
	nonce: string;
}): SQL => {
	const { ctes, appliedCounts, applied, bookmarkCount, snapshotColumns } =
		flushParts({ changes, bookmarks, snapshots });
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
	return sql`
		WITH ${sql.join(ctes, sql`, `)}
		SELECT ${applied} AS applied, ${bookmarkCount} AS bookmarks${snapshotColumns}
		WHERE CASE WHEN ${allLanded} THEN true
			ELSE (${`${FLUSH_ROLLBACK_MARKER}${nonce}:`}::text || ${bookmarkCount} || ':' || ${counts})::integer IS NULL END
	`;
};
