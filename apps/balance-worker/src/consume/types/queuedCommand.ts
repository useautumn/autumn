import type { DecidedMutation } from "../../processor/writer/types/mutation.js";

/** A queued command decided in arrival order; its commit settles with the consumed batch. */
export type QueuedCommand = {
	decided: Pick<DecidedMutation<unknown>, "waitForCommit">;
	/** A commit the store refused is consumed, never retried: undo what the consumer took for the command. */
	onRefused?: () => Promise<void>;
};
