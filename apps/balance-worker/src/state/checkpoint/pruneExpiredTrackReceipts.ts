import type { Database } from "bun:sqlite";

export const pruneExpiredTrackReceipts = ({
	database,
	topic,
	partition,
	expiresAtOrBefore,
	limit,
}: {
	database: Database;
	topic: string;
	partition: number;
	expiresAtOrBefore: number;
	limit: number;
}): { deletedCount: number } => {
	if (!Number.isSafeInteger(expiresAtOrBefore) || expiresAtOrBefore < 0) {
		throw new RangeError(
			"expiresAtOrBefore must be a non-negative safe integer",
		);
	}
	if (!Number.isSafeInteger(limit) || limit <= 0) {
		throw new RangeError("limit must be a positive safe integer");
	}

	const result = database
		.query<
			never,
			{
				topic: string;
				partition: number;
				expiresAtOrBefore: bigint;
				limit: number;
			}
		>(`
			DELETE FROM track_receipts
			WHERE rowid IN (
				SELECT rowid
				FROM track_receipts
				WHERE topic = $topic
					AND partition_id = $partition
					AND deduplication_expires_at <= $expiresAtOrBefore
				ORDER BY deduplication_expires_at, record_offset
				LIMIT $limit
			)
		`)
		.run({
			topic,
			partition,
			expiresAtOrBefore: BigInt(expiresAtOrBefore),
			limit,
		});
	return { deletedCount: result.changes };
};
