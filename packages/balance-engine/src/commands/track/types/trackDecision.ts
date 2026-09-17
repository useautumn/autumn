import type { Decision } from "../../../models/common/decision.js";
import type { SubjectStateMutation } from "../../../models/subjectStateMutation.js";

/** "new" for the request that wrote the mutation, "duplicate" for a retry of it. */
export type SupportedTrackDecision = {
	kind: "new" | "duplicate";
	mutation: SubjectStateMutation;
};

export type TrackDecision = Decision<SupportedTrackDecision>;
