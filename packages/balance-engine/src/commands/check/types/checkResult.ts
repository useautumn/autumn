/** What a check decided: whether the requirement is met. Never logged; the rows it read travel beside it in the reply. */
export type CheckResult = {
	allowed: boolean;
	reason: "insufficient_balance" | null;
	requiredBalance: number;
};
