import type {
	DesiredSegment,
	InstanceIdentity,
	SavedSegment,
} from "./timelineSegment";

export type ResolvedSegmentOrigin = "declared" | "retained" | "untouched";

export type ResolvedSegment = InstanceIdentity & {
	id: string;
	configHash: string;
	lifetime: boolean;
	startsAt: number;
	endsAt: number | null;
	origin: ResolvedSegmentOrigin;
	desired?: DesiredSegment;
	carriedBy?: SavedSegment;
	inheritsCancellation?: boolean;
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
