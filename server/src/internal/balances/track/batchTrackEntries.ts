import type { BatchTrackParams, TrackParams } from "@autumn/shared";

/** One batch item with its position in the request: per-item ids derive from the position, so it must survive a split. */
export type BatchTrackEntry = { item: TrackParams; index: number };

export const toBatchTrackEntries = ({
	body,
}: {
	body: BatchTrackParams;
}): BatchTrackEntry[] => body.map((item, index) => ({ item, index }));
