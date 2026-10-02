import { isAliveAt } from "../../timeline/timelineGuards";
import type { SavedTimeline } from "../../timeline/types/timeline";
import type { ResolvedSegment } from "../../timeline/types/timelineDiff";
import type {
	ReviewPhaseContents,
	ReviewPlanRow,
	ReviewPlanStatus,
} from "./types/reviewPhase";

const STATUS_ORDER: ReviewPlanStatus[] = ["starts", "updated", "kept", "ends"];

export const resolvedContentsAt = ({
	timeline,
	at,
}: {
	timeline: ResolvedSegment[];
	at: number;
}): ReviewPhaseContents =>
	new Map(
		timeline
			.filter((segment) => isAliveAt({ segment, at }))
			.map((segment) => [segment.key, { source: "resolved", segment }]),
	);

export const savedContentsAt = ({
	saved,
	at,
}: {
	saved: SavedTimeline;
	at: number;
}): ReviewPhaseContents =>
	new Map(
		saved.segments
			.filter((segment) => isAliveAt({ segment, at }))
			.map((segment) => [segment.key, { source: "saved", segment, at }]),
	);

const rowFor = ({
	key,
	contents,
	comparison,
	showsEnds,
}: {
	key: string;
	contents: ReviewPhaseContents;
	comparison: ReviewPhaseContents;
	showsEnds: boolean;
}): ReviewPlanRow | undefined => {
	const after = contents.get(key);
	const before = comparison.get(key);
	if (after && before) {
		const status =
			after.segment.configHash === before.segment.configHash
				? "kept"
				: "updated";
		return { status, before, after };
	}
	if (after) return { status: "starts", after };
	if (before && showsEnds) return { status: "ends", before };
	return undefined;
};

/** A phase against what it is compared with; only a phase with a saved self shows plans it lost. */
export const phasePlanRows = ({
	contents,
	comparison,
	showsEnds,
}: {
	contents: ReviewPhaseContents;
	comparison: ReviewPhaseContents;
	showsEnds: boolean;
}): ReviewPlanRow[] =>
	[...new Set([...contents.keys(), ...comparison.keys()])]
		.flatMap((key) => {
			const row = rowFor({ key, contents, comparison, showsEnds });
			return row ? [row] : [];
		})
		.sort(
			(first, second) =>
				STATUS_ORDER.indexOf(first.status) -
				STATUS_ORDER.indexOf(second.status),
		);
