import type {
	CustomerMeteringState,
	MeteringIdentity,
} from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";

/** What the writer hands `mutate`: the customer's freshest state. */
export type MutateParams = {
	state: CustomerMeteringState;
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
	/** Append this outcome; the customer's projection becomes nextState now. */
	| { kind: "write"; outcome: MeteringRecord; nextState: CustomerMeteringState }
	/** Nothing to write: reply immediately. */
	| { kind: "reply"; reply: Reply };

/** Resolved once the outcome is committed to Kafka and applied to SQLite. */
export type CommittedMutation = {
	/** "new" for the submission that wrote it, "duplicate" for retries of it. */
	kind: "new" | "duplicate";
	outcome: MeteringRecord;
};

/** Returned synchronously by `decide`: the decision is made, durability is not. */
export type DecidedMutation<Reply> = {
	/** Resolves after Kafka commit and SQLite apply. */
	waitForCommit(): Promise<Reply | CommittedMutation>;
};
