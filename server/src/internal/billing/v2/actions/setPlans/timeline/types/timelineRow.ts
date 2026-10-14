import type { SavedRow } from "./timelineSegment";

export type TimelineRow = SavedRow & {
	planId: string;
	internalEntityId: string | null;
	replacementKey: string;
	configHash: string;
	lifetime: boolean;
	onLiveSubscription: boolean;
	externalId: string | null;
};
