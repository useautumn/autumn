import { truncateMsToSecondPrecision } from "@autumn/shared";
import { isAliveAt, isAliveJustBefore } from "../../timeline/timelineGuards";
import type { SavedTimeline } from "../../timeline/types/timeline";
import type { ResolvedSegment } from "../../timeline/types/timelineDiff";
import type { ReviewPhaseMatch, ReviewPhaseMatches } from "./types/reviewPhase";

type ComparableSegment = {
	key: string;
	configHash: string;
	startsAt: number;
	endsAt: number | null;
};

const instancesAt = ({
	segments,
	at,
	justBefore,
}: {
	segments: ComparableSegment[];
	at: number;
	justBefore: boolean;
}) =>
	segments
		.filter((segment) =>
			justBefore
				? isAliveJustBefore({ segment, at })
				: isAliveAt({ segment, at }),
		)
		.map(({ key, configHash }) => `${key}:${configHash}`)
		.sort()
		.join(",");

/** The resulting timeline changes exactly what the saved one changes here, so no phase is touched. */
const isPreservedBoundary = ({
	saved,
	timeline,
	at,
}: {
	saved: SavedTimeline;
	timeline: ResolvedSegment[];
	at: number;
}) =>
	[true, false].every(
		(justBefore) =>
			instancesAt({ segments: saved.segments, at, justBefore }) ===
			instancesAt({ segments: timeline, at, justBefore }),
	);

/** Future dates where the saved timeline's set of plans changes. */
const savedPhaseStarts = ({
	saved,
	now,
}: {
	saved: SavedTimeline;
	now: number;
}) =>
	[
		...new Set(
			saved.segments
				.flatMap(({ startsAt, endsAt }) => [startsAt, endsAt])
				.filter((at): at is number => at !== null && at > now),
		),
	].sort((first, second) => first - second);

const gapIndex = ({ anchors, at }: { anchors: number[]; at: number }) =>
	anchors.filter((anchor) => anchor < at).length;

const groupByGap = ({
	anchors,
	dates,
}: {
	anchors: number[];
	dates: number[];
}) => {
	const groups = new Map<number, number[]>();
	for (const at of dates) {
		const gap = gapIndex({ anchors, at });
		groups.set(gap, [...(groups.get(gap) ?? []), at]);
	}
	return groups;
};

/**
 * The one place request phases meet saved phases: now with now, equal dates with each other,
 * then leftovers between two anchors pair up in order as moved phases.
 */
export const matchReviewPhases = ({
	saved,
	timeline,
	phaseStarts,
	now,
}: {
	saved: SavedTimeline;
	timeline: ResolvedSegment[];
	phaseStarts: number[];
	now: number;
}): ReviewPhaseMatches => {
	const requestStarts = phaseStarts.slice(1).map(truncateMsToSecondPrecision);
	const savedStarts = savedPhaseStarts({ saved, now });
	const anchors = [
		now,
		...requestStarts.filter((at) => savedStarts.includes(at)),
	];

	const changedSavedStarts = savedStarts.filter(
		(at) =>
			!anchors.includes(at) && !isPreservedBoundary({ saved, timeline, at }),
	);
	const savedByGap = groupByGap({ anchors, dates: changedSavedStarts });
	const requestByGap = groupByGap({
		anchors,
		dates: requestStarts.filter((at) => !anchors.includes(at)),
	});

	const movedFrom = new Map<number, number>();
	for (const [gap, requestDates] of requestByGap) {
		requestDates.forEach((at, index) => {
			const savedAt = savedByGap.get(gap)?.[index];
			if (savedAt !== undefined) movedFrom.set(at, savedAt);
		});
	}
	const pairedSavedStarts = new Set(movedFrom.values());

	const futurePhases = requestStarts.map((at): ReviewPhaseMatch => {
		if (anchors.includes(at)) return { at, comparison: { type: "saved", at } };
		const savedAt = movedFrom.get(at);
		return savedAt === undefined
			? { at, comparison: { type: "previousPhase" } }
			: { at, comparison: { type: "saved", at: savedAt } };
	});

	return {
		phases: [
			{ at: now, comparison: { type: "saved", at: now } },
			...futurePhases,
		],
		removedPhaseStarts: changedSavedStarts.filter(
			(at) => !pairedSavedStarts.has(at),
		),
	};
};
