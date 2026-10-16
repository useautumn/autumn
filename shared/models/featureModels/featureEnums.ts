export enum FeatureType {
	Boolean = "boolean",
	Metered = "metered",
	CreditSystem = "credit_system",
	AiCreditSystem = "ai_credit_system",
}

/** How several plans' grants of one feature combine: added up, or the highest / lowest wins. */
export enum FeatureCombine {
	Sum = "sum",
	Max = "max",
	Min = "min",
}

export enum AggregateType {
	Sum = "sum",
}

export enum FeatureUsageType {
	Single = "single_use",
	Continuous = "continuous_use",
}
