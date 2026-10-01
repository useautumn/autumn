import { isAliveAt, isAliveJustBefore } from "../timelineGuards";
import type { SavedTimeline } from "../types/timeline";
import type {
	ResolvedSegment,
	TimelineTransition,
	TransitionOrigin,
	TransitionSide,
} from "../types/timelineDiff";
import type { SavedSegment } from "../types/timelineSegment";

type SideAt = (at: number) => Map<string, TransitionSide>;

/** A transition before its origin is known. */
type UnattributedTransition = TimelineTransition extends infer Transition
	? Transition extends TimelineTransition
		? Omit<Transition, "origin" | "at">
		: never
	: never;

const savedRowAt = ({
	savedSegment,
	at,
}: {
	savedSegment: SavedSegment;
	at: number;
}) =>
	[...savedSegment.rows].reverse().find((row) => row.startsAt <= at) ??
	savedSegment.rows[0];

const savedSide = ({
	savedSegment,
	at,
}: {
	savedSegment: SavedSegment;
	at: number;
}): TransitionSide => ({
	key: savedSegment.key,
	planId: savedSegment.planId,
	internalEntityId: savedSegment.internalEntityId,
	replacementKey: savedSegment.replacementKey,
	configHash: savedSegment.configHash,
	startsAt: savedSegment.startsAt,
	endsAt: savedSegment.endsAt,
	ref: {
		source: "saved",
		customerProductId: savedRowAt({ savedSegment, at }).customerProductId,
	},
	customerProductIds: savedSegment.rows.map(
		({ customerProductId }) => customerProductId,
	),
});

const resolvedSide = (segment: ResolvedSegment): TransitionSide => ({
	key: segment.key,
	planId: segment.planId,
	internalEntityId: segment.internalEntityId,
	replacementKey: segment.replacementKey,
	configHash: segment.configHash,
	startsAt: segment.startsAt,
	endsAt: segment.endsAt,
	ref: { source: "resolved", segmentId: segment.id },
	customerProductIds: (segment.carriedBy?.rows ?? []).map(
		({ customerProductId }) => customerProductId,
	),
});

const sidesByKey = (sides: TransitionSide[]) =>
	new Map(sides.map((side) => [side.key, side]));

const savedSidesAt =
	({
		saved,
		justBefore,
	}: {
		saved: SavedTimeline;
		justBefore: boolean;
	}): SideAt =>
	(at) =>
		sidesByKey(
			saved.segments
				.filter((segment) =>
					justBefore
						? isAliveJustBefore({ segment, at })
						: isAliveAt({ segment, at }),
				)
				.map((savedSegment) => savedSide({ savedSegment, at })),
		);

const resolvedSidesAt =
	({
		timeline,
		justBefore,
	}: {
		timeline: ResolvedSegment[];
		justBefore: boolean;
	}): SideAt =>
	(at) =>
		sidesByKey(
			timeline
				.filter((segment) =>
					justBefore
						? isAliveJustBefore({ segment, at })
						: isAliveAt({ segment, at }),
				)
				.map(resolvedSide),
		);

/** The same rows run both sides, so nothing about the plan changes here. */
const isSameRun = ({
	from,
	to,
}: {
	from: TransitionSide;
	to: TransitionSide;
}) => {
	const sameSegment =
		from.ref.source === "resolved" &&
		to.ref.source === "resolved" &&
		from.ref.segmentId === to.ref.segmentId;
	return (
		sameSegment ||
		from.customerProductIds.some((id) => to.customerProductIds.includes(id))
	);
};

const classify = ({
	from,
	to,
}: {
	from?: TransitionSide;
	to?: TransitionSide;
}): UnattributedTransition | undefined => {
	if (from && to) {
		return from.configHash === to.configHash && isSameRun({ from, to })
			? { kind: "continues", from, to }
			: { kind: "updated", from, to };
	}
	if (to) return { kind: "starts", to };
	if (from) return { kind: "ends", from };
	return undefined;
};

const transitionHashes = (transition: UnattributedTransition) => ({
	fromHash: "from" in transition ? transition.from.configHash : null,
	toHash: "to" in transition ? transition.to.configHash : null,
});

const isSameTransition = ({
	desired,
	saved,
}: {
	desired: UnattributedTransition;
	saved: UnattributedTransition;
}) => {
	const desiredHashes = transitionHashes(desired);
	const savedHashes = transitionHashes(saved);
	return (
		desired.kind === saved.kind &&
		desiredHashes.fromHash === savedHashes.fromHash &&
		desiredHashes.toHash === savedHashes.toHash
	);
};

const attribute = ({
	transition,
	origin,
	at,
}: {
	transition: UnattributedTransition;
	origin: TransitionOrigin;
	at: number;
}) => ({ ...transition, origin, at }) as TimelineTransition;

/** At now every change is the request's: the saved timeline holds still until then. */
const transitionsNow = ({
	saved,
	timeline,
	now,
}: {
	saved: SavedTimeline;
	timeline: ResolvedSegment[];
	now: number;
}): TimelineTransition[] => {
	const before = savedSidesAt({ saved, justBefore: false })(now);
	const after = resolvedSidesAt({ timeline, justBefore: false })(now);
	const keys = new Set([...before.keys(), ...after.keys()]);

	return [...keys].flatMap((key) => {
		const transition = classify({ from: before.get(key), to: after.get(key) });
		return transition
			? [attribute({ transition, origin: "request", at: now })]
			: [];
	});
};

/** A saved change the request drops only matters if the plan is still around, or was going to start. */
const isMeaningfulWithdrawal = ({
	savedTransition,
	desiredFrom,
	desiredTo,
}: {
	savedTransition: UnattributedTransition;
	desiredFrom?: TransitionSide;
	desiredTo?: TransitionSide;
}) =>
	savedTransition.kind === "starts" ||
	desiredFrom !== undefined ||
	desiredTo !== undefined;

const transitionsAtBoundary = ({
	saved,
	timeline,
	at,
}: {
	saved: SavedTimeline;
	timeline: ResolvedSegment[];
	at: number;
}): TimelineTransition[] => {
	const desiredBefore = resolvedSidesAt({ timeline, justBefore: true })(at);
	const desiredAfter = resolvedSidesAt({ timeline, justBefore: false })(at);
	const savedBefore = savedSidesAt({ saved, justBefore: true })(at);
	const savedAfter = savedSidesAt({ saved, justBefore: false })(at);
	const keys = new Set([
		...desiredBefore.keys(),
		...desiredAfter.keys(),
		...savedBefore.keys(),
		...savedAfter.keys(),
	]);

	return [...keys].flatMap((key): TimelineTransition[] => {
		const desiredFrom = desiredBefore.get(key);
		const desiredTo = desiredAfter.get(key);
		const desiredTransition = classify({ from: desiredFrom, to: desiredTo });
		const savedTransition = classify({
			from: savedBefore.get(key),
			to: savedAfter.get(key),
		});

		if (desiredTransition && desiredTransition.kind !== "continues") {
			const kept =
				savedTransition !== undefined &&
				isSameTransition({
					desired: desiredTransition,
					saved: savedTransition,
				});
			return [
				attribute({
					transition: desiredTransition,
					origin: kept ? "saved" : "request",
					at,
				}),
			];
		}

		const withdrawn =
			savedTransition !== undefined &&
			savedTransition.kind !== "continues" &&
			isMeaningfulWithdrawal({ savedTransition, desiredFrom, desiredTo });
		return withdrawn
			? [attribute({ transition: savedTransition, origin: "withdrawn", at })]
			: [];
	});
};

const boundaries = ({
	saved,
	timeline,
	now,
}: {
	saved: SavedTimeline;
	timeline: ResolvedSegment[];
	now: number;
}) =>
	[
		...new Set(
			[...saved.segments, ...timeline]
				.flatMap(({ startsAt, endsAt }) => [startsAt, endsAt])
				.filter((at): at is number => at !== null && at > now),
		),
	].sort((first, second) => first - second);

/** A plan the request creates shows its end on its own row, never as a separate removal. */
const isEndOfCreatedSegment = ({
	transition,
	createdSegmentIds,
}: {
	transition: TimelineTransition;
	createdSegmentIds: Set<string>;
}) =>
	transition.kind === "ends" &&
	transition.origin === "request" &&
	transition.from.ref.source === "resolved" &&
	createdSegmentIds.has(transition.from.ref.segmentId);

/** Every change at every boundary, classified by what happens and who causes it. */
export const timelineToTransitions = ({
	saved,
	timeline,
	now,
}: {
	saved: SavedTimeline;
	timeline: ResolvedSegment[];
	now: number;
}): TimelineTransition[] => {
	const createdSegmentIds = new Set(
		timeline
			.filter((segment) => !segment.carriedBy && segment.origin === "declared")
			.map(({ id }) => id),
	);
	const boundaryTransitions = [
		transitionsNow({ saved, timeline, now }),
		...boundaries({ saved, timeline, now }).map((at) =>
			transitionsAtBoundary({ saved, timeline, at }),
		),
	];

	return boundaryTransitions
		.flat()
		.filter(
			(transition) => !isEndOfCreatedSegment({ transition, createdSegmentIds }),
		);
};
