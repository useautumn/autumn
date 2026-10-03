/** A queued command decided in arrival order: its commit is still landing, and settles with the consumed batch. */
export type QueuedDecision = {
	waitForCommit(): Promise<unknown>;
};
