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

export type TimelineDiff = {
	now: number;
	timeline: ResolvedSegment[];
	operations: TimelineOperation[];
};
