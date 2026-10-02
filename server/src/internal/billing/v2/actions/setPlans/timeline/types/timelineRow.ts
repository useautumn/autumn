import type { SavedRow } from "./timelineSegment";

/** A saved customer product reduced to what the timeline compares. */
export type TimelineRow = SavedRow & {
	planId: string;
	internalEntityId: string | null;
	replacementKey: string;
	configHash: string;
	lifetime: boolean;
	onLiveSubscription: boolean;
	externalId: string | null;
};
