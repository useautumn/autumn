import { sortByStart, startsInFuture } from "../timelineGuards";
import type { SavedTimeline } from "../types/timeline";
import type { ResolvedSegment, TimelineOperation } from "../types/timelineDiff";
import type { SavedRow, SavedSegment } from "../types/timelineSegment";

const rowRunsBefore = ({
	row,
	endsAt,
}: {
	row: SavedRow;
	endsAt: number | null;
}) => endsAt === null || row.startsAt < endsAt;

/** Rows that start before the carried segment ends stay; the last one takes its end. */
const carriedSegmentOperations = ({
	segment,
	carriedBy,
}: {
	segment: ResolvedSegment;
	carriedBy: SavedSegment;
}): TimelineOperation[] => {
	const rows = sortByStart(carriedBy.rows);
	const keptRows = rows.filter((row) =>
		rowRunsBefore({ row, endsAt: segment.endsAt }),
	);
	const droppedRows = rows.filter((row) => !keptRows.includes(row));
	const lastKeptRow = keptRows.at(-1);

	return [
		...keptRows.map(
			(row): TimelineOperation => ({
				type: "keep",
				key: segment.key,
				segmentId: segment.id,
				customerProductId: row.customerProductId,
			}),
		),
		...(lastKeptRow && lastKeptRow.endsAt !== segment.endsAt
			? [
					{
						type: "retime" as const,
						key: segment.key,
						segmentId: segment.id,
						customerProductId: lastKeptRow.customerProductId,
						endsAt: segment.endsAt,
					},
				]
			: []),
		...droppedRows.map(
			(row): TimelineOperation => ({
				type: "delete",
				key: segment.key,
				customerProductId: row.customerProductId,
			}),
		),
	];
};

const uncarriedRowOperation = ({
	key,
	row,
}: {
	key: string;
	row: SavedRow;
}): TimelineOperation =>
	row.scheduled
		? { type: "delete", key, customerProductId: row.customerProductId }
		: { type: "expire", key, customerProductId: row.customerProductId };

/** The row writes that turn the saved timeline into the resolved one. */
export const timelineToOperations = ({
	saved,
	timeline,
	now,
}: {
	saved: SavedTimeline;
	timeline: ResolvedSegment[];
	now: number;
}): TimelineOperation[] => {
	const carriedRowIds = new Set(
		timeline.flatMap(({ carriedBy }) =>
			(carriedBy?.rows ?? []).map(({ customerProductId }) => customerProductId),
		),
	);

	const resolvedOperations = timeline.flatMap(
		(segment): TimelineOperation[] => {
			if (segment.origin === "untouched") return [];
			if (segment.carriedBy) {
				return carriedSegmentOperations({
					segment,
					carriedBy: segment.carriedBy,
				});
			}
			return [
				{
					type: "insert",
					key: segment.key,
					segmentId: segment.id,
					startsNow: !startsInFuture({ segment, now }),
				},
			];
		},
	);

	const removedOperations = saved.segments.flatMap((savedSegment) =>
		savedSegment.rows
			.filter((row) => !carriedRowIds.has(row.customerProductId))
			.map((row) => uncarriedRowOperation({ key: savedSegment.key, row })),
	);

	return [...resolvedOperations, ...removedOperations];
};
