export type UndeclaredPlansPolicy = "end" | "retain";

export type SetPlansPolicies = {
	undeclared: UndeclaredPlansPolicy;
	canceling: "keepCancellation" | "recreate";
	pastDue: "continue" | "recreate";
	liveRows:
		| "carry"
		| "recreate"
		| "recreateRenewing"
		| "recreateWhenPaidRecurringStarts";
	unbilledRows: "carry" | "recreate";
};
