import type { BatchTrackParams, TrackParams } from "@autumn/shared";
import type { TokenDeduction } from "../utils/types/featureDeduction.js";

export type BatchTrackEntry = {
	item: TrackParams;
	index: number;
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
