import type { SavedTimeline } from "../../timeline/types/timeline";
import type { TimelineDiff } from "../../timeline/types/timelineDiff";
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

/** Each request phase against its matched saved self, or the phase before it when it is new. */
export const timelineToReviewRows = ({
	saved,
	diff,
	matches,
}: {
	saved: SavedTimeline;
	diff: TimelineDiff;
	matches: ReviewPhaseMatches;
}): ReviewRows => ({
	phases: withoutCarriedOverRows(
		matches.phases.map((phase, phaseIndex) => ({
			at: phase.at,
			comparison: phase.comparison,
			rows: phasePlanRows({
				contents: resolvedContentsAt({ timeline: diff.timeline, at: phase.at }),
				comparison: comparisonContents({
					saved,
					diff,
					phase,
					previousPhase: matches.phases[phaseIndex - 1],
				}),
				showsEnds: phase.comparison.type === "saved",
			}),
		})),
	),
	removedPhases: matches.removedPhaseStarts.map((at) => ({
		at,
		rows: phasePlanRows({
			contents: new Map(),
			comparison: savedContentsAt({ saved, at }),
			showsEnds: true,
		}),
	})),
});
