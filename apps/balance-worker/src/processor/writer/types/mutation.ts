import type {
	MutatingCommand,
	MutationEffect,
	MutationRecord,
	MutationSource,
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
	/** Set for a command consumed from the command topic; rides on the record so the bookmark moves with the rows. */
	source?: MutationSource;
	/** Runs inside the writer's synchronous critical section; must not await. */
	mutate: (params: MutateParams) => MutationResult<Reply>;
};

export type MutationResult<Reply> =
	/** Append this mutation; the customer's projection becomes nextState now. */
	| {
			kind: "write";
			mutation: SubjectStateMutation;
			nextState: SubjectState;
			/** What each owner stores; absent, nextState is split into the customer and the entity it names. */
			projectedStates?: SubjectState[];
			/** What must happen elsewhere because of this mutation; stamped on the log's copy for its readers. */
			effects?: MutationEffect[];
	  }
	/** Nothing to write: reply immediately. */
	| { kind: "reply"; reply: Reply };

/** The mutation and projected result returned at the requested durability milestone. */
export type CommittedMutation = {
	/** "new" for the submission that wrote it, "duplicate" for retries of it. */
	kind: "new" | "duplicate";
	mutation: MutationRecord;
	/** The subject's rows with this mutation applied; a retry after later mutations sees the rows as they stand now. */
	state: SubjectState;
};

/** Returned synchronously by `decide`: the decision is made, durability is not. */
export type DecidedMutation<Reply> = {
	kind: "write" | "duplicate" | "reply";
	/** Resolves at the submission's durability milestone (Kafka by default). */
	waitForCommit(): Promise<Reply | CommittedMutation>;
	/** Resolves once this write's batch is stored (or durably refused); replies wait for preceding writes. */
	waitForStore(): Promise<void>;
};

/**
 * A lean submission (serial-decide arm D): decided and answered without a settlement. The reply is built
 * at decide time from the record and the projected rows, and the I/O thread holds it until the
 * partition's commit position passes the record's sequence number.
 */
export type LeanSubmission<Reply> = Pick<
	MutationSubmission<Reply>,
	"command" | "mutate"
> & {
	/** The reply the caller gets for this write, or for a retry of it while it is still in flight. */
	replyOf: (committed: CommittedMutation) => string;
};

export type LeanDecision<Reply> =
	/** Appended: the reply may be released once the partition's commit position reaches `seq`. */
	| { kind: "write"; seq: number; body: string }
	/** A retry: of a write still in flight (its seq) or of one already stored (seq 0: release now). */
	| { kind: "duplicate"; seq: number; body: string }
	| { kind: "reply"; reply: Reply };
