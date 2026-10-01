/** How many deliveries SQS gives a message before it gives up on it. */
export type RetryBudget =
	| { kind: "bounded"; maxReceiveCount: number }
	/** No dead-letter queue: SQS redelivers until the message expires. */
	| { kind: "unbounded" }
	/** The queue's policy couldn't be read, so every failure is reported. */
	| { kind: "unknown" };
