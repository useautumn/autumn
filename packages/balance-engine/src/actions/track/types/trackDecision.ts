import type { TrackOutcome } from "./trackOutcome.js";

// Named refusals: the engine reports what it cannot handle instead of
// guessing, so a shadow rollout can never silently claim coverage.
export type UnsupportedDecisionReason =
	| "command_conflict"
	| "entity_not_supported"
	| "feature_not_found"
	| "multiple_customer_entitlements_not_supported"
	| "properties_not_supported"
	| "refund_not_supported"
	| "subject_mismatch";

// In-process verdict of computeTrack. Only the outcome inside it crosses the
// wire; `duplicate` returns the stored receipt without publishing anything.
export type TrackDecision =
	| { kind: "new"; outcome: TrackOutcome }
	| { kind: "duplicate"; outcome: TrackOutcome }
	| { kind: "unsupported"; reason: UnsupportedDecisionReason };
