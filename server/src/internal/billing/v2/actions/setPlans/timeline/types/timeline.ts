import type { DesiredSegment, SavedSegment } from "./timelineSegment";

/** The customer's in-scope plans as their rows run them, from now on. */
export type SavedTimeline = {
	segments: SavedSegment[];
};

/** The plans the request declares, per instance and interval. */
export type DesiredTimeline = {
	segments: DesiredSegment[];
	/** When the whole schedule ends; plans retained on the live subscription end with it. */
	endsAt: number | null;
};
