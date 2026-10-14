import type { DesiredSegment, SavedSegment } from "./timelineSegment";

export type SavedTimeline = {
	segments: SavedSegment[];
};

export type DesiredTimeline = {
	segments: DesiredSegment[];
	endsAt: number | null;
};
