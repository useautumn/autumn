import type {
	DesiredSegment,
	InstanceIdentity,
	SavedSegment,
} from "./timelineSegment";

/**
 * declared: the request lists it. retained: the request leaves it out and the
 * policy keeps it. untouched: a one-off purchase nothing may end.
 */
export type ResolvedSegmentOrigin = "declared" | "retained" | "untouched";

/** One interval of the timeline the request results in. */
export type ResolvedSegment = InstanceIdentity & {
	id: string;
	configHash: string;
	lifetime: boolean;
	startsAt: number;
	endsAt: number | null;
	origin: ResolvedSegmentOrigin;
	desired?: DesiredSegment;
	/** The saved segment whose rows carry this one; absent when a row is inserted. */
	carriedBy?: SavedSegment;
};

export type TimelineOperation =
	| { type: "keep"; key: string; segmentId: string; customerProductId: string }
	| {
			type: "retime";
			key: string;
			segmentId: string;
			customerProductId: string;
			endsAt: number | null;
	  }
	| { type: "expire"; key: string; customerProductId: string }
	| { type: "delete"; key: string; customerProductId: string }
	| { type: "insert"; key: string; segmentId: string; startsNow: boolean };

/**
 * request: this request causes it. saved: already scheduled and kept.
 * withdrawn: already scheduled, and this request cancels it.
 */
export type TransitionOrigin = "request" | "saved" | "withdrawn";

export type TransitionSegmentRef =
	| { source: "saved"; customerProductId: string }
	| { source: "resolved"; segmentId: string };

/** One side of a transition: the instance as it runs on that side of the boundary. */
export type TransitionSide = InstanceIdentity & {
	configHash: string;
	startsAt: number;
	endsAt: number | null;
	ref: TransitionSegmentRef;
	/** The saved rows running this side; empty for a row the request inserts. */
	customerProductIds: string[];
};

export type TimelineTransition = { at: number; origin: TransitionOrigin } & (
	| { kind: "starts"; to: TransitionSide }
	| { kind: "ends"; from: TransitionSide }
	| { kind: "updated"; from: TransitionSide; to: TransitionSide }
	| { kind: "continues"; from: TransitionSide; to: TransitionSide }
);

export type TransitionKind = TimelineTransition["kind"];

export type TimelineDiff = {
	now: number;
	timeline: ResolvedSegment[];
	operations: TimelineOperation[];
	transitions: TimelineTransition[];
};
