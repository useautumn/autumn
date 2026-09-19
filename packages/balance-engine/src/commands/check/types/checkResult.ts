/** What a check decided: whether the requirement is met. Never logged; the rows it read travel beside it in the reply. */
export type CheckResult = {
	allowed: boolean;
	reason: "insufficient_balance" | "feature_not_attached" | null;
	/** In the funding feature's units: credits when a credit system pays for the checked feature. */
	requiredBalance: number;
	/** The feature the answer is denominated in: the checked one or the credit system funding it; null when nothing is attached. */
	fundingFeatureId: string | null;
	/** A boolean feature is a flag: attached means allowed, and there is no balance to report. */
	isFlag: boolean;
};
