export type RetryBudget =
	| { kind: "bounded"; maxReceiveCount: number }
	/** No dead-letter queue: SQS redelivers until the message expires. */
	| { kind: "unbounded" }
	| { kind: "unknown" };
