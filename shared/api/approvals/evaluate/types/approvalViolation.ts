/** Booleans stay booleans; numbers, ids and durations are short human strings. */
export type ViolationValue = string | boolean;

/** A condition of a rule that this request matched. */
export type ApprovalViolation = {
	/** Preview-style path to the fact, e.g. `incoming[0].free_trial.duration`. */
	field: string;
	label: string;
	/** The condition as the rule states it, e.g. "< 2 months". */
	limit: ViolationValue;
	actual: ViolationValue;
};
