/** Why an org cannot create another Atom; null when it can. */
export type AtomLimitsReason = "not_on_plan" | "limit_reached";

/** Whether an org's Atoms are on its plan, how many it may run, and whether it may create another. */
export type AtomLimits = {
	included: boolean;
	limit: number;
	used: number;
	canCreate: boolean;
	reason: AtomLimitsReason | null;
};
