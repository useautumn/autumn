import { truncateMsToSecondPrecision } from "@autumn/shared";
import { classifyFirstPhaseStart } from "../../setup/classifyFirstPhaseStart";
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
	new Set(
		segments
			.filter((segment) =>
				justBefore
					? isAliveJustBefore({ segment, at })
					: isAliveAt({ segment, at }),
			)
			.map(({ key, configHash }) => `${key}:${configHash}`),
	);

/** The instances that start and end at a date, ignoring those running straight through it. */
const transitionAt = ({
	segments,
	at,
}: {
	segments: ComparableSegment[];
	at: number;
}) => {
	const before = instancesAt({ segments, at, justBefore: true });
	const after = instancesAt({ segments, at, justBefore: false });
	const started = [...after].filter((instance) => !before.has(instance));
	const ended = [...before].filter((instance) => !after.has(instance));
	return JSON.stringify([started.sort(), ended.sort()]);
};

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
	transitionAt({ segments: saved.segments, at }) ===
	transitionAt({ segments: timeline, at });

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

/** Within a gap, the n-th unmatched request phase is the n-th unmatched saved phase moved. */
const pairMovedPhases = ({
	requestByGap,
	savedByGap,
}: {
	requestByGap: Map<number, number[]>;
	savedByGap: Map<number, number[]>;
}) => {
	const movedFrom = new Map<number, number>();
	for (const [gap, requestDates] of requestByGap) {
		for (const [index, at] of requestDates.entries()) {
			const savedAt = savedByGap.get(gap)?.[index];
			if (savedAt !== undefined) movedFrom.set(at, savedAt);
		}
	}
	return movedFrom;
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
	const [firstPhaseStart = now] = phaseStarts;
	const firstPhaseAt =
		classifyFirstPhaseStart({
			startsAt: firstPhaseStart,
			currentEpochMs: now,
		}) === "future"
			? truncateMsToSecondPrecision(firstPhaseStart)
			: now;
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

	const movedFrom = pairMovedPhases({ requestByGap, savedByGap });
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
			{ at: firstPhaseAt, comparison: { type: "saved", at: now } },
			...futurePhases,
		],
		removedPhaseStarts: changedSavedStarts.filter(
			(at) => !pairedSavedStarts.has(at),
		),
	};
};
