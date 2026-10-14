import type { ResolvedSegment } from "../../../timeline/types/timelineDiff";
import type { SavedSegment } from "../../../timeline/types/timelineSegment";

export type ReviewSegment =
	| { source: "saved"; segment: SavedSegment; at: number }
	| { source: "resolved"; segment: ResolvedSegment };

export type ReviewPhaseContents = Map<string, ReviewSegment>;

export type ReviewPhaseComparison =
	| { type: "saved"; at: number }
	| { type: "previousPhase" };

export type ReviewPhaseMatch = {
	at: number;
	endsAt: number;
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
