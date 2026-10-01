import type { SavedTimeline } from "../../timeline/types/timeline";
import type { TimelineDiff } from "../../timeline/types/timelineDiff";
import { matchReviewPhases } from "./matchReviewPhases";
import {
	phasePlanRows,
	resolvedContentsAt,
	savedContentsAt,
} from "./phasePlanRows";
import type {
	ReviewPhaseComparison,
	ReviewPhaseMatch,
	ReviewPlanRow,
} from "./types/reviewPhase";

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
	phases,
	phaseIndex,
}: {
	saved: SavedTimeline;
	diff: TimelineDiff;
	phases: ReviewPhaseMatch[];
	phaseIndex: number;
}) => {
	const { comparison } = phases[phaseIndex] as ReviewPhaseMatch;
	if (comparison.type === "saved") {
		return savedContentsAt({ saved, at: comparison.at });
	}
	const previousAt = phases[phaseIndex - 1]?.at ?? diff.now;
	return resolvedContentsAt({ timeline: diff.timeline, at: previousAt });
};

/** Each request phase against its matched saved self, or the phase before it when it is new. */
export const timelineToReviewRows = ({
	saved,
	diff,
	phaseStarts,
}: {
	saved: SavedTimeline;
	diff: TimelineDiff;
	phaseStarts: number[];
}): ReviewRows => {
	const { phases, removedPhaseStarts } = matchReviewPhases({
		saved,
		timeline: diff.timeline,
		phaseStarts,
		now: diff.now,
	});

	return {
		phases: phases.map((phase, phaseIndex) => ({
			at: phase.at,
			comparison: phase.comparison,
			rows: phasePlanRows({
				contents: resolvedContentsAt({ timeline: diff.timeline, at: phase.at }),
				comparison: comparisonContents({ saved, diff, phases, phaseIndex }),
				showsEnds: phase.comparison.type === "saved",
			}),
		})),
		removedPhases: removedPhaseStarts.map((at) => ({
			at,
			rows: phasePlanRows({
				contents: new Map(),
				comparison: savedContentsAt({ saved, at }),
				showsEnds: true,
			}),
		})),
	};
};
