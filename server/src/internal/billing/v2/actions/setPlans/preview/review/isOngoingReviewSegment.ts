import type { ReviewSegment } from "./types/reviewPhase";

export type OngoingContext = { now: number; savedHasLaterPhases: boolean };

/**
 * A requested plan is ongoing when it came from unscheduled_plans; a saved one when it
 * is live now with no end through a schedule that has later phases, as the form seeds it.
 */
export const isOngoingReviewSegment = ({
	reviewSegment,
	ongoingContext: { now, savedHasLaterPhases },
}: {
	reviewSegment: ReviewSegment;
	ongoingContext: OngoingContext;
}) =>
	reviewSegment.source === "resolved"
		? reviewSegment.segment.desired?.source.type === "ongoing"
		: savedHasLaterPhases &&
			reviewSegment.segment.endsAt === null &&
			reviewSegment.segment.startsAt <= now;
