import { variant } from "@autumn/edge-config";

/** B cuts per-track allocation on the hot sync track path; A is today's. */
export const TRACK_ALLOC_EXPERIMENT = "track-alloc";

export function cutsTrackAllocation(): boolean {
	return variant(TRACK_ALLOC_EXPERIMENT) === "B";
}
