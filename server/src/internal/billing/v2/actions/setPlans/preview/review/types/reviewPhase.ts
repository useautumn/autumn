import type { ResolvedSegment } from "../../../timeline/types/timelineDiff";
import type { SavedSegment } from "../../../timeline/types/timelineSegment";

/** A plan instance as one phase holds it: from the saved timeline at a date, or the resolved one. */
export type ReviewSegment =
	| { source: "saved"; segment: SavedSegment; at: number }
	| { source: "resolved"; segment: ResolvedSegment };

export type ReviewPhaseContents = Map<string, ReviewSegment>;

/** What a request phase is compared with: a saved phase at its date, or the request phase before it. */
export type ReviewPhaseComparison =
	| { type: "saved"; at: number }
	| { type: "previousPhase" };

export type ReviewPhaseMatch = {
	at: number;
	comparison: ReviewPhaseComparison;
};

export type ReviewPhaseMatches = {
	phases: ReviewPhaseMatch[];
	removedPhaseStarts: number[];
};

export type ReviewPlanRow =
	| { status: "starts"; after: ReviewSegment }
	| { status: "updated" | "kept"; before: ReviewSegment; after: ReviewSegment }
	| { status: "ends"; before: ReviewSegment };

export type ReviewPlanStatus = ReviewPlanRow["status"];
