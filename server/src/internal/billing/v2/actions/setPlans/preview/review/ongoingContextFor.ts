import type { SavedTimeline } from "../../timeline/types/timeline";
import type { OngoingContext } from "./isOngoingReviewSegment";

/** The saved schedule changes after now, which is what makes an open-ended saved plan ongoing. */
const savedHasLaterPhases = ({
	saved,
	now,
}: {
	saved: SavedTimeline;
	now: number;
}) =>
	saved.segments.some(
		(segment) =>
			segment.startsAt > now ||
			(segment.endsAt !== null && segment.endsAt > now),
	);

export const ongoingContextFor = ({
	saved,
	now,
}: {
	saved: SavedTimeline;
	now: number;
}): OngoingContext => ({
	now,
	savedHasLaterPhases: savedHasLaterPhases({ saved, now }),
});
