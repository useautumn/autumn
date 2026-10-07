export type UndeclaredPlansPolicy = "end" | "retain";

/** How the diff treats state the request doesn't spell out, resolved once in setup. */
export type SetPlansPolicies = {
	/** A live in-scope plan the request never lists ends now, or keeps running. */
	undeclared: UndeclaredPlansPolicy;
	/** A canceling plan re-listed unchanged keeps its cancellation, or is recreated. */
	canceling: "keepCancellation" | "recreate";
	/** A past-due plan re-listed unchanged continues, or is recreated. */
	pastDue: "continue" | "recreate";
	/** Whether live rows may carry a desired plan; a replaced subscription may force recreation. */
	liveRows:
		| "carry"
		| "recreate"
		| "recreateRenewing"
		| "recreateWhenPaidRecurringStarts";
	unbilledRows: "carry" | "recreate";
};
