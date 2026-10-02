import { truncateMsToSecondPrecision } from "@autumn/shared";
import { isAliveAt } from "../timeline/timelineGuards";
import type {
	ResolvedSegment,
	TimelineDiff,
} from "../timeline/types/timelineDiff";
import type { SchedulePhasePlan } from "../types/schedulePhasePlan";

/** Ongoing and retained plans belong to no phase: the schedule never ends them. */
const isPhasePlanSegment = (segment: ResolvedSegment) =>
	segment.origin === "declared" && segment.desired?.source.type === "phase";

/** The row a segment runs on at a moment: the carried row covering it, or the inserted one. */
const segmentCustomerProductIdAt = ({
	segment,
	at,
	customerProductIdBySegmentId,
}: {
	segment: ResolvedSegment;
	at: number;
	customerProductIdBySegmentId: Map<string, string>;
}) => {
	const carriedRow = segment.carriedBy
		? [...segment.carriedBy.rows].reverse().find((row) => row.startsAt <= at)
		: undefined;
	return (
		carriedRow?.customerProductId ??
		customerProductIdBySegmentId.get(segment.id)
	);
};

/** Each request phase lists the phase plans running when it starts; the rows themselves hold the timing. */
export const diffToSchedule = ({
	diff,
	phaseStarts,
	customerProductIdBySegmentId,
}: {
	diff: TimelineDiff;
	phaseStarts: number[];
	customerProductIdBySegmentId: Map<string, string>;
}): SchedulePhasePlan[] =>
	phaseStarts.map((startsAt) => {
		const at = Math.max(truncateMsToSecondPrecision(startsAt), diff.now);
		return {
			startsAt,
			customerProductIds: diff.timeline
				.filter(
					(segment) =>
						isPhasePlanSegment(segment) && isAliveAt({ segment, at }),
				)
				.flatMap((segment) => {
					const customerProductId = segmentCustomerProductIdAt({
						segment,
						at,
						customerProductIdBySegmentId,
					});
					return customerProductId ? [customerProductId] : [];
				}),
		};
	});
