import type { ReviewSegment } from "./types/reviewPhase";

export type OngoingContext = { now: number; savedHasLaterPhases: boolean };

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
