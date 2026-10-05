import type { SavedTimeline } from "../../timeline/types/timeline";
import type { TimelineDiff } from "../../timeline/types/timelineDiff";
import {
	isOngoingReviewSegment,
	type OngoingContext,
} from "./isOngoingReviewSegment";
import { ongoingContextFor } from "./ongoingContextFor";
import {
	phasePlanRows,
	resolvedContentsAt,
	savedContentsAt,
} from "./phasePlanRows";
import type {
	ReviewPhaseComparison,
	ReviewPhaseMatch,
	ReviewPhaseMatches,
	ReviewPlanRow,
} from "./types/reviewPhase";
import { withoutCarriedOverRows } from "./withoutCarriedOverRows";

export type ReviewRows = {
	phases: {
		at: number;
		endsAt: number;
		comparison: ReviewPhaseComparison;
		rows: ReviewPlanRow[];
	}[];
	removedPhases: { at: number; rows: ReviewPlanRow[] }[];
};

const comparisonContents = ({
	saved,
	diff,
	phase,
	previousPhase,
}: {
	saved: SavedTimeline;
	diff: TimelineDiff;
	phase: ReviewPhaseMatch;
	previousPhase?: ReviewPhaseMatch;
}) => {
	if (phase.comparison.type === "saved") {
		return savedContentsAt({ saved, at: phase.comparison.at });
	}
	return resolvedContentsAt({
		timeline: diff.timeline,
		at: previousPhase?.at ?? diff.now,
	});
};

/** A removed phase lists what stops with it; ongoing plans run on, and the first phase already shows them. */
const isLostWithRemovedPhase = ({
	row,
	ongoingContext,
}: {
	row: ReviewPlanRow;
	ongoingContext: OngoingContext;
}) =>
	row.status === "ends" &&
	!isOngoingReviewSegment({ reviewSegment: row.before, ongoingContext });

/** Ongoing plans run through every phase, so only the first phase lists them. */
const continuesOngoing = ({
	row,
	ongoingContext,
}: {
	row: ReviewPlanRow;
	ongoingContext: OngoingContext;
}) =>
	"after" in row &&
	isOngoingReviewSegment({ reviewSegment: row.after, ongoingContext });

/** Each request phase against its matched saved self, or the phase before it when it is new. */
export const timelineToReviewRows = ({
	saved,
	diff,
	matches,
}: {
	saved: SavedTimeline;
	diff: TimelineDiff;
	matches: ReviewPhaseMatches;
}): ReviewRows => {
	const ongoingContext = ongoingContextFor({ saved, now: diff.now });
	return {
		phases: withoutCarriedOverRows(
			matches.phases.map((phase, phaseIndex) => ({
				at: phase.at,
				endsAt: phase.endsAt,
				comparison: phase.comparison,
				rows: phasePlanRows({
					contents: resolvedContentsAt({
						timeline: diff.timeline,
						at: phase.at,
					}),
					comparison: comparisonContents({
						saved,
						diff,
						phase,
						previousPhase: matches.phases[phaseIndex - 1],
					}),
					showsEnds: phase.comparison.type === "saved",
				}).filter(
					(row) =>
						phaseIndex === 0 || !continuesOngoing({ row, ongoingContext }),
				),
			})),
		),
		removedPhases: matches.removedPhaseStarts.map((at) => ({
			at,
			rows: phasePlanRows({
				contents: new Map(),
				comparison: savedContentsAt({ saved, at }),
				showsEnds: true,
			}).filter((row) => isLostWithRemovedPhase({ row, ongoingContext })),
		})),
	};
};
