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

/** How far a command waits before its caller is answered.
 *
 *  "log" answers once Kafka holds the record, which is the point it becomes
 *  durable: a worker dying afterwards loses nothing, because the next owner
 *  replays the log. The store applies behind the reply. Nothing in the answer
 *  comes from the store, so the reply is identical either way; what is given up
 *  is being told that the store later refused the row.
 *
 *  "store" keeps the caller waiting until the row is in Postgres too, and a
 *  refusal still reaches it as an error. That costs the store's latency on every
 *  such command, so it is for the ones where the caller must not be told a thing
 *  landed until it has landed everywhere. */
export type MutationDurability = "log" | "store";

/** What a command hands the writer: the command, and how to decide it. Dedup is derived from the command here. */
export type MutationSubmission<Reply> = {
	command: MutatingCommand;
	/** The rows an initialize brings; a retry must bring the same ones. */
	baseline?: SubjectState;
	/** Defaults to "log": metered writes do not wait for the projection. */
	durability?: MutationDurability;
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
