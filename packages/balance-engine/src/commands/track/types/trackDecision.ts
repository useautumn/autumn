import type { CustomerStateMutation } from "../../../models/customerStateMutation.js";

export type UnsupportedDecisionReason =
	| "command_conflict"
	| "entity_not_supported"
	| "feature_not_found"
	| "multiple_customer_entitlements_not_supported"
	| "properties_not_supported"
	| "refund_not_supported"
	| "subject_mismatch";

export type TrackDecision =
	| { kind: "new" | "duplicate"; mutation: CustomerStateMutation }
	| { kind: "unsupported"; reason: UnsupportedDecisionReason };
