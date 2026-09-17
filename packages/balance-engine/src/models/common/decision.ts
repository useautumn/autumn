export type UnsupportedDecisionReason =
	| "command_conflict"
	| "entity_not_found"
	| "feature_not_found"
	| "multiple_customer_entitlements_not_supported"
	| "properties_not_supported"
	| "refund_not_supported"
	| "subject_mismatch";

/** The engine could not decide this command on the worker; the caller falls back or refuses. */
export type UnsupportedDecision = {
	kind: "unsupported";
	reason: UnsupportedDecisionReason;
};

/** Every command answers with what it decided, or why it could not. */
export type Decision<Supported extends { kind: string }> =
	| Supported
	| UnsupportedDecision;
