import type { BatchTrackParams, TrackParams } from "@autumn/shared";
import type { TokenDeduction } from "../utils/types/featureDeduction.js";

/** One batch item with its position in the request: per-item ids derive from the position, so it must survive a split. */
export type BatchTrackEntry = {
	item: TrackParams;
	index: number;
	/** A batch track_tokens item's cost, so its replay prices it like the sync path. */
	tokens?: TokenDeduction;
};

export const toBatchTrackEntries = ({
	body,
	tokens,
}: {
	body: BatchTrackParams;
	tokens?: (TokenDeduction | undefined)[];
}): BatchTrackEntry[] =>
	body.map((item, index) => ({ item, index, tokens: tokens?.[index] }));
