import type {
	MeteringIdentity,
	SubjectState,
	SubjectStateMutation,
} from "@autumn/balance-engine";

/** What the writer hands `mutate`: the customer's freshest state, null before initialize. */
export type MutateParams = {
	state: SubjectState | null;
};

/** What a command hands the writer: who, which request, and how to decide it. */
export type MutationSubmission<Reply> = {
	identity: MeteringIdentity;
	commandId: string;
	/** Same commandId + same fingerprint is a retry; a different fingerprint is a conflict. */
	fingerprint: string;
	/** Runs inside the writer's synchronous critical section; must not await. */
	mutate: (params: MutateParams) => MutationResult<Reply>;
};

export type MutationResult<Reply> =
	/** Append this mutation; the customer's projection becomes nextState now. */
	| {
			kind: "write";
			mutation: SubjectStateMutation;
			nextState: SubjectState;
	  }
	/** Nothing to write: reply immediately. */
	| { kind: "reply"; reply: Reply };

/** Resolved once the mutation is committed to Kafka and applied to SQLite. */
export type CommittedMutation = {
	/** "new" for the submission that wrote it, "duplicate" for retries of it. */
	kind: "new" | "duplicate";
	mutation: SubjectStateMutation;
};

/** Returned synchronously by `decide`: the decision is made, durability is not. */
export type DecidedMutation<Reply> = {
	/** Resolves after Kafka commit and SQLite apply. */
	waitForCommit(): Promise<Reply | CommittedMutation>;
};
