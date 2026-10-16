/** Rule levels, most specific first. */
export const APPROVAL_LEVELS = ["user", "role", "everyone"] as const;

export type ApprovalLevel = (typeof APPROVAL_LEVELS)[number];

/** Booleans stay booleans; numbers, ids and durations are short human strings. */
export type ViolationValue = string | boolean;

export type ApprovalViolation = {
	/** Preview-style path to the failing fact, e.g. `incoming[0].free_trial`. */
	field: string;
	label: string;
	limit: ViolationValue;
	actual: ViolationValue;
};

export type ApprovalDecidedBy = {
	level: ApprovalLevel;
	rule_id: string;
	rule_name: string;
};

export type ApprovalVerdict =
	| { verdict: "allow"; decided_by: ApprovalDecidedBy | null }
	| {
			verdict: "deny";
			violations: ApprovalViolation[];
			decided_by: ApprovalDecidedBy;
			allowed_roles: string[];
			message: string;
	  }
	| { verdict: "fallback"; fallback: "scopes" };
