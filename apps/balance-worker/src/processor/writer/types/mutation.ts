import type {
	MutatingCommand,
	MutationRecord,
	SubjectState,
	SubjectStateMutation,
} from "@autumn/balance-engine";

/** What the writer hands `mutate`: the customer's freshest state, null before initialize. */
export type MutateParams = {
	state: SubjectState | null;
};

/** What a command hands the writer: the command, and how to decide it. Dedup is derived from the command here. */
export type MutationSubmission<Reply> = {
	command: MutatingCommand;
	/** The rows an initialize brings; a retry must bring the same ones. */
	baseline?: SubjectState;
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

/** Resolved once the record is committed to Kafka and applied to SQLite. */
export type CommittedMutation = {
	/** "new" for the submission that wrote it, "duplicate" for retries of it. */
	kind: "new" | "duplicate";
	mutation: MutationRecord;
	/** The subject's rows with this mutation applied; a retry after later mutations sees the rows as they stand now. */
	state: SubjectState;
};

/** Returned synchronously by `decide`: the decision is made, durability is not. */
export type DecidedMutation<Reply> = {
	/** Resolves after Kafka commit and SQLite apply. */
	waitForCommit(): Promise<Reply | CommittedMutation>;
};
