import type { SubjectScope } from "../../types/subject.js";
import type { SnapshotMissReason } from "../types/snapshotHit.js";

export type SnapshotBatchCounts = Record<"hits" | SnapshotMissReason, number>;

export const emptySnapshotBatchCounts = (): SnapshotBatchCounts => ({
	hits: 0,
	absent: 0,
	version: 0,
	expired: 0,
	parse: 0,
	identity: 0,
	asOf: 0,
});

/** One line per SELECT, hits and misses by reason, so a partition's snapshot health reads off the log. */
export const logSnapshotBatch = ({
	scope,
	size,
	counts,
	selectMs,
	fallbackMs,
	queueDepth,
	refused,
}: {
	scope: SubjectScope;
	size: number;
	counts: SnapshotBatchCounts;
	selectMs: number;
	fallbackMs: number;
	queueDepth: number;
	refused?: unknown;
}): void => {
	scope.ctx.logger?.info?.(
		{
			event: "balance_worker.snapshot_batch",
			data: {
				partition: scope.ctx.position?.partition,
				size,
				...counts,
				selectMs: Math.round(selectMs * 100) / 100,
				fallbackMs: Math.round(fallbackMs * 100) / 100,
				queueDepth,
				...(refused === undefined ? {} : { refused: String(refused) }),
			},
		},
		`Balance worker snapshot batch: ${counts.hits}/${size} hits`,
	);
};
