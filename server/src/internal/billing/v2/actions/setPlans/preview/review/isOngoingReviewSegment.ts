import type { ReviewSegment } from "./types/reviewPhase";

/**
 * A requested plan is ongoing when it came from unscheduled_plans; a saved one when it
 * runs from now with no end through a schedule that has later phases, as the form seeds it.
 */
export const isOngoingReviewSegment = ({
	reviewSegment,
	savedHasLaterPhases,
}: {
	reviewSegment: ReviewSegment;
	savedHasLaterPhases: boolean;
}) =>
	reviewSegment.source === "resolved"
		? reviewSegment.segment.desired?.source.type === "ongoing"
		: savedHasLaterPhases &&
			reviewSegment.segment.endsAt === null &&
			reviewSegment.segment.startsAt <= reviewSegment.at;
